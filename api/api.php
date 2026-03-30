<?php
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once 'config.php';

$conn = get_db_connection();
$method = $_SERVER['REQUEST_METHOD'];

if (!$conn) {
    echo json_encode(["status" => "error", "message" => "Database connection failed"]);
    exit;
}

// --- GET endpoints ---
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'status';

    switch ($action) {
        case 'get_parts':
            $stmt = $conn->query("SELECT id, name, name_fr, category, description, specs, image_url, mesh_name, hotspot_x, hotspot_y, hotspot_z FROM robot_parts");
            $parts = $stmt->fetchAll();
            foreach ($parts as &$part) {
                $part['specs'] = json_decode($part['specs'], true);
            }
            echo json_encode($parts);
            break;

        case 'get_part':
            $id = intval($_GET['id'] ?? 0);
            $stmt = $conn->prepare("SELECT * FROM robot_parts WHERE id = ?");
            $stmt->execute([$id]);
            $part = $stmt->fetch();
            if ($part) {
                $part['specs'] = json_decode($part['specs'], true);
                $docStmt = $conn->prepare("SELECT id, title, doc_type, content, file_url FROM documents WHERE part_id = ?");
                $docStmt->execute([$id]);
                $part['documents'] = $docStmt->fetchAll();
            }
            echo json_encode($part ?: ["status" => "error", "message" => "Part not found"]);
            break;

        case 'get_docs':
            $partId = intval($_GET['part_id'] ?? 0);
            $stmt = $conn->prepare("SELECT * FROM documents WHERE part_id = ?");
            $stmt->execute([$partId]);
            echo json_encode($stmt->fetchAll());
            break;

        case 'get_faq':
            $partId = isset($_GET['part_id']) ? intval($_GET['part_id']) : null;
            if ($partId) {
                $stmt = $conn->prepare("SELECT * FROM faq WHERE part_id = ? OR part_id IS NULL ORDER BY created_at DESC");
                $stmt->execute([$partId]);
            } else {
                $stmt = $conn->query("SELECT * FROM faq ORDER BY created_at DESC");
            }
            echo json_encode($stmt->fetchAll());
            break;

        default:
            echo json_encode([
                "status" => "online",
                "project" => "SAE 402 - MARA",
                "engine" => "PlayCanvas + Gemini AI"
            ]);
    }
}

// --- POST endpoints ---
elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? 'unknown';

    switch ($action) {
        case 'ask_ai':
            $question = trim($input['question'] ?? '');
            $partId = isset($input['part_id']) ? intval($input['part_id']) : null;

            if (empty($question)) {
                echo json_encode(["status" => "error", "message" => "Question is required"]);
                break;
            }

            // Check existing FAQ first
            $faqStmt = $conn->prepare("SELECT answer FROM faq WHERE question = ? LIMIT 1");
            $faqStmt->execute([$question]);
            $existing = $faqStmt->fetch();

            if ($existing) {
                echo json_encode([
                    "status" => "success",
                    "answer" => $existing['answer'],
                    "source" => "cache"
                ]);
                break;
            }

            // Build context
            $context = "Tu es un assistant technique specialise sur le robot Universal Robots UR5e (e-Series). Reponds en francais de maniere concise et technique.";
            if ($partId) {
                $partStmt = $conn->prepare("SELECT name_fr, description, specs FROM robot_parts WHERE id = ?");
                $partStmt->execute([$partId]);
                $partData = $partStmt->fetch();
                if ($partData) {
                    $context .= "\n\nContexte - Composant selectionne : " . $partData['name_fr'];
                    $context .= "\nDescription : " . $partData['description'];
                    $context .= "\nSpecifications : " . $partData['specs'];
                }
            }
            $context .= "\n\nSpecifications generales UR5e : Payload 5kg, Portee 850mm, 6 axes, Repetabilite +/-0.03mm, IP54, 20.6kg, <65dB, 100-240VAC.";

            // Call Gemini API
            $geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' . GEMINI_MODEL . ':generateContent?key=' . GEMINI_API_KEY;
            $geminiPayload = json_encode([
                'contents' => [
                    ['role' => 'user', 'parts' => [['text' => $context . "\n\nQuestion : " . $question]]]
                ],
                'generationConfig' => [
                    'temperature' => 0.7,
                    'maxOutputTokens' => 1024
                ]
            ]);

            $ch = curl_init($geminiUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => $geminiPayload,
                CURLOPT_TIMEOUT => 30,
                CURLOPT_SSL_VERIFYPEER => false
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200 || !$response) {
                echo json_encode([
                    "status" => "error",
                    "message" => "Gemini API error (HTTP $httpCode)",
                    "answer" => "Desole, l'assistant IA est temporairement indisponible. Veuillez reessayer."
                ]);
                break;
            }

            $geminiData = json_decode($response, true);
            $answer = $geminiData['candidates'][0]['content']['parts'][0]['text'] ?? 'Pas de reponse generee.';

            // Save to FAQ
            $saveStmt = $conn->prepare("INSERT INTO faq (question, answer, part_id) VALUES (?, ?, ?)");
            $saveStmt->execute([$question, $answer, $partId]);

            echo json_encode([
                "status" => "success",
                "answer" => $answer,
                "source" => "gemini",
                "faq_id" => $conn->lastInsertId()
            ]);
            break;

        case 'log_interaction':
            $stmt = $conn->prepare("INSERT INTO interactions (action_type, part_id, metadata) VALUES (?, ?, ?)");
            $stmt->execute([
                $input['action_type'] ?? 'click',
                isset($input['part_id']) ? intval($input['part_id']) : null,
                json_encode($input['metadata'] ?? $input)
            ]);
            echo json_encode([
                "status" => "success",
                "id" => $conn->lastInsertId()
            ]);
            break;

        default:
            echo json_encode(["status" => "error", "message" => "Unknown action: $action"]);
    }
}

$conn = null;
