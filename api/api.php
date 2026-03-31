<?php
// ============================================================
// MARA SAE402 - API REST
// Routing par ?action= (GET) ou {action:""} (POST JSON)
// ============================================================

header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Preflight CORS
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

// ============================================================
// GET endpoints
// ============================================================
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'status';

    switch ($action) {

        // --- Liste tous les composants ---
        case 'get_parts':
            $stmt = $conn->query(
                "SELECT id, name, name_fr, category, description, specs,
                        image_url, mesh_name, hotspot_x, hotspot_y, hotspot_z
                 FROM robot_parts
                 ORDER BY id"
            );
            $parts = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($parts as &$part) {
                if (is_string($part['specs'])) {
                    $part['specs'] = json_decode($part['specs'], true);
                }
            }
            echo json_encode($parts);
            break;

        // --- Detail d'un composant + ses documents ---
        case 'get_part':
            $id = intval($_GET['id'] ?? 0);
            if ($id <= 0) {
                echo json_encode(["status" => "error", "message" => "Invalid part id"]);
                break;
            }
            $stmt = $conn->prepare("SELECT * FROM robot_parts WHERE id = ?");
            $stmt->execute([$id]);
            $part = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($part) {
                if (is_string($part['specs'])) {
                    $part['specs'] = json_decode($part['specs'], true);
                }
                $docStmt = $conn->prepare(
                    "SELECT id, title, doc_type, content, file_url
                     FROM documents WHERE part_id = ? ORDER BY id"
                );
                $docStmt->execute([$id]);
                $part['documents'] = $docStmt->fetchAll(PDO::FETCH_ASSOC);
            }
            echo json_encode($part ?: ["status" => "error", "message" => "Part not found"]);
            break;

        // --- Documents d'un composant ---
        case 'get_docs':
            $partId = intval($_GET['part_id'] ?? 0);
            $stmt = $conn->prepare(
                "SELECT id, title, doc_type, content, file_url
                 FROM documents WHERE part_id = ? ORDER BY id"
            );
            $stmt->execute([$partId]);
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        // --- FAQ (generale ou filtree par composant) ---
        case 'get_faq':
            $partId = isset($_GET['part_id']) ? intval($_GET['part_id']) : null;
            if ($partId) {
                // Retourne les Q/R specifiques au composant + les generales
                $stmt = $conn->prepare(
                    "SELECT id, question, answer, part_id
                     FROM faq
                     WHERE part_id = ? OR part_id IS NULL
                     ORDER BY part_id DESC, created_at DESC
                     LIMIT 20"
                );
                $stmt->execute([$partId]);
            } else {
                $stmt = $conn->query(
                    "SELECT id, question, answer, part_id
                     FROM faq
                     ORDER BY created_at DESC
                     LIMIT 20"
                );
            }
            echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
            break;

        // --- Statut API ---
        default:
            echo json_encode([
                "status"  => "online",
                "project" => "SAE 402 - MARA",
                "stack"   => "A-Frame + Three.js + AR.js + Gemini AI",
                "robot"   => "Universal Robots UR5e e-Series"
            ]);
    }

// ============================================================
// POST endpoints
// ============================================================
} elseif ($method === 'POST') {
    $input  = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $input['action'] ?? 'unknown';

    switch ($action) {

        // --- Assistant IA Gemini ---
        case 'ask_ai':
            $question = trim($input['question'] ?? '');
            $partId   = isset($input['part_id']) ? intval($input['part_id']) : null;

            if (empty($question)) {
                echo json_encode(["status" => "error", "message" => "Question is required"]);
                break;
            }

            // 1. Chercher en cache FAQ (question identique)
            $faqStmt = $conn->prepare(
                "SELECT answer FROM faq WHERE question = ? LIMIT 1"
            );
            $faqStmt->execute([$question]);
            $existing = $faqStmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                echo json_encode([
                    "status" => "success",
                    "answer" => $existing['answer'],
                    "source" => "cache"
                ]);
                break;
            }

            // 2. Construire le contexte systeme
            $systemCtx  = "Tu es MARA, un assistant technique expert en robotique industrielle, ";
            $systemCtx .= "specialise sur le robot collaboratif Universal Robots UR5e (e-Series). ";
            $systemCtx .= "Tu reponds toujours en francais, de facon concise et technique. ";
            $systemCtx .= "Si la question n est pas liee au robot UR5e, redirige poliment vers ce sujet. ";
            $systemCtx .= "Tu as acces aux specifications completes et a la documentation de maintenance.\n\n";

            // 3. Specif. generales UR5e toujours injectees
            $systemCtx .= "=== SPECIFICATIONS GENERALES UR5e ===\n";
            $systemCtx .= "Charge utile max : 5 kg | Portee : 850 mm | 6 axes | Repetabilite : +/-0.03 mm\n";
            $systemCtx .= "Masse bras : 20.6 kg | Protection : IP54 | Bruit : <65 dB(A)\n";
            $systemCtx .= "Alimentation : 100-240 VAC 47-440 Hz | Conso : 200W typ / 570W max\n";
            $systemCtx .= "Joints Size 1 (grands) : J1 Base, J2 Shoulder, J3 Elbow - Vitesse 180 deg/s\n";
            $systemCtx .= "Joints Size 0 (petits) : J4 Wrist1 (ref 124100), J5 Wrist2 (ref 124101), J6 Wrist3 (ref 102414) - Vitesse 180 deg/s\n";
            $systemCtx .= "Segments : Upper Arm 425mm (J2>J3), Forearm 392mm (J3>J5)\n";
            $systemCtx .= "Bride outil : ISO 9409-1-50-4-M6 | Capteur F/T 6 axes : +/-50N / +/-10 Nm\n";
            $systemCtx .= "Control Box : IP44, Ethernet 1Gb, Modbus TCP, EthernetIP, PROFINET, ROS/ROS2\n";
            $systemCtx .= "Teach Pendant TP5 : 12 pouces, PolyScope, E-Stop PLd Cat.3, FreeDrive\n\n";

            // 4. Si composant selectionne, injecter ses donnees specifiques
            if ($partId) {
                $partStmt = $conn->prepare(
                    "SELECT name_fr, description, specs FROM robot_parts WHERE id = ?"
                );
                $partStmt->execute([$partId]);
                $partData = $partStmt->fetch(PDO::FETCH_ASSOC);

                if ($partData) {
                    $systemCtx .= "=== COMPOSANT SELECTIONNE PAR LE TECHNICIEN ===\n";
                    $systemCtx .= "Nom : " . $partData['name_fr'] . "\n";
                    $systemCtx .= "Description : " . $partData['description'] . "\n";
                    $systemCtx .= "Specifications : " . $partData['specs'] . "\n\n";

                    // Injecter les documents techniques du composant
                    $docStmt = $conn->prepare(
                        "SELECT title, content FROM documents WHERE part_id = ? ORDER BY id"
                    );
                    $docStmt->execute([$partId]);
                    $docs = $docStmt->fetchAll(PDO::FETCH_ASSOC);
                    if (!empty($docs)) {
                        $systemCtx .= "=== DOCUMENTATION TECHNIQUE DU COMPOSANT ===\n";
                        foreach ($docs as $doc) {
                            $systemCtx .= "--- " . $doc['title'] . " ---\n";
                            // Limiter a 800 caracteres par doc pour ne pas exploser le contexte
                            $systemCtx .= mb_substr($doc['content'], 0, 800) . "\n\n";
                        }
                    }
                }
            }

            // 5. Ajouter les 3 dernieres Q/R pertinentes comme exemples
            if ($partId) {
                $histStmt = $conn->prepare(
                    "SELECT question, answer FROM faq
                     WHERE part_id = ? OR part_id IS NULL
                     ORDER BY created_at DESC LIMIT 3"
                );
                $histStmt->execute([$partId]);
            } else {
                $histStmt = $conn->query(
                    "SELECT question, answer FROM faq ORDER BY created_at DESC LIMIT 3"
                );
            }
            $history = $histStmt->fetchAll(PDO::FETCH_ASSOC);
            if (!empty($history)) {
                $systemCtx .= "=== EXEMPLES DE QUESTIONS/REPONSES PRECEDENTES ===\n";
                foreach ($history as $h) {
                    $systemCtx .= "Q: " . $h['question'] . "\n";
                    $systemCtx .= "R: " . mb_substr($h['answer'], 0, 300) . "\n\n";
                }
            }

            // 6. Appel API Gemini
            $geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/'
                       . GEMINI_MODEL . ':generateContent?key=' . GEMINI_API_KEY;

            $geminiPayload = json_encode([
                'contents' => [
                    [
                        'role'  => 'user',
                        'parts' => [['text' => $systemCtx . "\nQuestion du technicien : " . $question]]
                    ]
                ],
                'generationConfig' => [
                    'temperature'     => 0.4,
                    'maxOutputTokens' => 800,
                    'topP'            => 0.8
                ]
            ]);

            $ch = curl_init($geminiUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS     => $geminiPayload,
                CURLOPT_TIMEOUT        => 30,
                CURLOPT_SSL_VERIFYPEER => false
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200 || !$response) {
                echo json_encode([
                    "status"  => "error",
                    "message" => "Gemini API error (HTTP $httpCode)",
                    "answer"  => "Desole, l'assistant IA est temporairement indisponible. Veuillez reessayer dans quelques instants."
                ]);
                break;
            }

            $geminiData = json_decode($response, true);
            $answer = $geminiData['candidates'][0]['content']['parts'][0]['text']
                      ?? 'Pas de reponse generee.';

            // 7. Sauvegarder en FAQ pour le cache
            $saveStmt = $conn->prepare(
                "INSERT INTO faq (question, answer, part_id) VALUES (?, ?, ?)"
            );
            $saveStmt->execute([$question, $answer, $partId]);

            echo json_encode([
                "status"  => "success",
                "answer"  => $answer,
                "source"  => "gemini",
                "faq_id"  => $conn->lastInsertId()
            ]);
            break;

        // --- Journalisation des interactions utilisateur ---
        case 'log_interaction':
            $stmt = $conn->prepare(
                "INSERT INTO interactions (action_type, part_id, metadata) VALUES (?, ?, ?)"
            );
            $stmt->execute([
                $input['action_type'] ?? 'click',
                isset($input['part_id']) ? intval($input['part_id']) : null,
                json_encode($input['metadata'] ?? [])
            ]);
            echo json_encode([
                "status" => "success",
                "id"     => $conn->lastInsertId()
            ]);
            break;

        default:
            echo json_encode(["status" => "error", "message" => "Unknown action: $action"]);
    }
}

$conn = null;
