<?php
// ============================================================
// MARA SAE402 - API REST
// Routing par ?action= (GET) ou {action:""} (POST JSON)
// ============================================================

// Évite que les warnings PHP (ex: curl_close deprecated en PHP 8.5)
// ne polluent le corps JSON et ne cassent le parsing côté client.
error_reporting(0);
ini_set('display_errors', '0');

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

// La connexion DB est tentée mais non bloquante pour ask_ai.
// Les endpoints de données (get_parts, etc.) en ont besoin ;
// ask_ai peut fonctionner avec Gemini seul (DB = cache optionnel).
$conn   = get_db_connection();   // null si MySQL est éteint
$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// GET endpoints
// ============================================================
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'status';

    // Les endpoints de données nécessitent une DB active
    $needsDb = ['get_parts', 'get_part', 'get_docs', 'get_faq'];
    if (in_array($action, $needsDb) && !$conn) {
        echo json_encode(["status" => "error", "message" => "Base de données indisponible. Lancez MySQL/XAMPP."]);
        exit;
    }

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
        // La DB est OPTIONNELLE ici : cache + contexte si dispo, Gemini seul sinon.
        case 'ask_ai':
            $question = trim($input['question'] ?? '');
            $partId   = isset($input['part_id']) ? intval($input['part_id']) : null;

            if (empty($question)) {
                echo json_encode(["status" => "error", "message" => "Question manquante"]);
                break;
            }

            // 1. Cache FAQ — uniquement si DB disponible
            if ($conn) {
                try {
                    $faqStmt = $conn->prepare("SELECT answer FROM faq WHERE question = ? LIMIT 1");
                    $faqStmt->execute([$question]);
                    $existing = $faqStmt->fetch(PDO::FETCH_ASSOC);
                    if ($existing) {
                        echo json_encode(["status" => "success", "answer" => $existing['answer'], "source" => "cache"]);
                        break;
                    }
                } catch (Exception $e) { /* cache non critique */ }
            }

            // 2. Prompt système contextuel (specs UR5e toujours incluses)
            $systemCtx  = "Tu es MARA, un assistant technique expert en robotique industrielle, ";
            $systemCtx .= "specialise sur le robot collaboratif Universal Robots UR5e (e-Series). ";
            $systemCtx .= "Tu reponds toujours en francais, de facon concise et technique. ";
            $systemCtx .= "Si la question n'est pas liee au robot UR5e, redirige poliment vers ce sujet. ";
            $systemCtx .= "Tu as acces aux specifications completes et a la documentation de maintenance.\n\n";

            // Specifications generales UR5e — toujours injectees
            $systemCtx .= "=== SPECIFICATIONS GENERALES UR5e ===\n";
            $systemCtx .= "Charge utile : 5 kg | Portee : 850 mm | 6 axes | Repetabilite : +/-0.03 mm\n";
            $systemCtx .= "Masse : 20.6 kg | Protection : IP54 | Bruit : <65 dB(A)\n";
            $systemCtx .= "Alimentation : 100-240 VAC 47-440 Hz | Conso : 200W typ / 570W max\n";
            $systemCtx .= "Joints Size 1 : J1 Base, J2 Shoulder, J3 Elbow — vitesse max 180 deg/s\n";
            $systemCtx .= "Joints Size 0 : J4 Wrist1 (ref 124100), J5 Wrist2 (ref 124101), J6 Wrist3 (ref 102414)\n";
            $systemCtx .= "Segments : Upper Arm 425 mm, Forearm 392 mm\n";
            $systemCtx .= "Bride outil : ISO 9409-1-50-4-M6 | Capteur F/T 6 axes\n";
            $systemCtx .= "Boitier : IP44, Ethernet 1 Gb, Modbus TCP, EtherNet/IP, PROFINET, ROS/ROS2\n";
            $systemCtx .= "Teach Pendant TP5 : 12 pouces, PolyScope, E-Stop PLd Cat.3, mode FreeDrive\n\n";

            // 3. Contexte composant — uniquement si DB disponible et composant selectionne
            if ($conn && $partId) {
                try {
                    $partStmt = $conn->prepare("SELECT name_fr, description, specs FROM robot_parts WHERE id = ?");
                    $partStmt->execute([$partId]);
                    $partData = $partStmt->fetch(PDO::FETCH_ASSOC);
                    if ($partData) {
                        $systemCtx .= "=== COMPOSANT SELECTIONNE ===\n";
                        $systemCtx .= "Nom : " . $partData['name_fr'] . "\n";
                        $systemCtx .= "Description : " . $partData['description'] . "\n";
                        if (!empty($partData['specs'])) {
                            $systemCtx .= "Specs : " . $partData['specs'] . "\n";
                        }
                        $systemCtx .= "\n";

                        // Documents techniques du composant
                        $docStmt = $conn->prepare("SELECT title, content FROM documents WHERE part_id = ? ORDER BY id");
                        $docStmt->execute([$partId]);
                        $docs = $docStmt->fetchAll(PDO::FETCH_ASSOC);
                        if (!empty($docs)) {
                            $systemCtx .= "=== DOCUMENTATION TECHNIQUE ===\n";
                            foreach ($docs as $doc) {
                                $systemCtx .= "--- " . $doc['title'] . " ---\n";
                                $systemCtx .= mb_substr($doc['content'], 0, 800) . "\n\n";
                            }
                        }
                    }
                } catch (Exception $e) { /* contexte non critique */ }
            }

            // 4. Appel API Gemini
            if (!defined('GEMINI_API_KEY') || empty(GEMINI_API_KEY) || GEMINI_API_KEY === 'VOTRE_CLE_ICI') {
                echo json_encode([
                    "status"  => "error",
                    "message" => "Clé Gemini non configurée dans api/config.php",
                    "answer"  => "L'assistant IA n'est pas configuré : ajoutez votre clé Gemini dans api/config.php."
                ]);
                break;
            }

            $geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/'
                       . GEMINI_MODEL . ':generateContent?key=' . GEMINI_API_KEY;

            $geminiPayload = json_encode([
                'contents' => [[
                    'role'  => 'user',
                    'parts' => [['text' => $systemCtx . "Question du technicien : " . $question]]
                ]],
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
            $rawResponse = curl_exec($ch);
            $httpCode    = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError   = curl_error($ch);
            // curl_close() supprimé : déprécié PHP 8.5 (sans effet depuis PHP 8.0)

            // Erreur cURL (pas de réseau, DNS, etc.)
            if ($rawResponse === false || !empty($curlError)) {
                echo json_encode([
                    "status"  => "error",
                    "message" => "Erreur réseau vers Gemini : " . $curlError,
                    "answer"  => "Impossible de contacter l'API Gemini. Vérifiez la connexion internet du serveur."
                ]);
                break;
            }

            $geminiData = json_decode($rawResponse, true);

            // Erreur renvoyée par Gemini (clé invalide, quota dépassé, etc.)
            if ($httpCode !== 200) {
                $geminiMsg = $geminiData['error']['message'] ?? "HTTP $httpCode";
                echo json_encode([
                    "status"  => "error",
                    "message" => "Gemini API : " . $geminiMsg,
                    "answer"  => "L'API Gemini a retourné une erreur : " . $geminiMsg
                ]);
                break;
            }

            // Extraire la réponse texte
            $answer = $geminiData['candidates'][0]['content']['parts'][0]['text']
                      ?? null;

            if (!$answer) {
                // Cas blocage de sécurité ou réponse vide
                $finishReason = $geminiData['candidates'][0]['finishReason'] ?? 'UNKNOWN';
                echo json_encode([
                    "status"  => "error",
                    "message" => "Réponse vide (finishReason: $finishReason)",
                    "answer"  => "L'IA n'a pas pu générer de réponse pour cette question. Essayez de reformuler."
                ]);
                break;
            }

            // 5. Sauvegarder en FAQ (cache) — uniquement si DB disponible
            $faqId = null;
            if ($conn) {
                try {
                    $saveStmt = $conn->prepare("INSERT INTO faq (question, answer, part_id) VALUES (?, ?, ?)");
                    $saveStmt->execute([$question, $answer, $partId]);
                    $faqId = $conn->lastInsertId();
                } catch (Exception $e) { /* sauvegarde non critique */ }
            }

            echo json_encode([
                "status" => "success",
                "answer" => $answer,
                "source" => "gemini",
                "faq_id" => $faqId
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
