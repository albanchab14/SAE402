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

// --- Helper: reponse JSON avec code HTTP ---
function json_response($data, $httpCode = 200) {
    http_response_code($httpCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error($message, $httpCode = 500) {
    json_response(["status" => "error", "message" => $message], $httpCode);
}

// --- Config ---
if (!file_exists(__DIR__ . '/config.php')) {
    json_error(
        "Missing config.php. Copy api/config.php.example to api/config.php and fill your DB / Gemini credentials.",
        500
    );
}

require_once __DIR__ . '/config.php';

// --- Connexion DB (peut etre null si MySQL est eteint) ---
$conn = null;
try {
    $conn = get_db_connection();
} catch (Exception $e) {
    // On laisse $conn = null, geré au cas par cas
}

$method = $_SERVER['REQUEST_METHOD'];

// ============================================================
// GET endpoints
// ============================================================
if ($method === 'GET') {
    $action = $_GET['action'] ?? 'status';

    // Les endpoints GET de données nécessitent la DB
    if (in_array($action, ['get_parts', 'get_part', 'get_docs', 'get_faq']) && !$conn) {
        json_error("Database connection failed. Start MySQL (XAMPP) and check config.php.", 503);
    }

    switch ($action) {

        // --- Liste tous les composants ---
        case 'get_parts':
            try {
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
                json_response($parts);
            } catch (PDOException $e) {
                error_log('[MARA] get_parts error: ' . $e->getMessage());
                json_error("Database query failed: " . $e->getMessage(), 500);
            }
            break;

        // --- Detail d'un composant + ses documents ---
        case 'get_part':
            $id = intval($_GET['id'] ?? 0);
            if ($id <= 0) {
                json_error("Invalid part id", 400);
            }
            try {
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
                    json_response($part);
                } else {
                    json_error("Part not found", 404);
                }
            } catch (PDOException $e) {
                error_log('[MARA] get_part error: ' . $e->getMessage());
                json_error("Database query failed", 500);
            }
            break;

        // --- Documents d'un composant ---
        case 'get_docs':
            $partId = intval($_GET['part_id'] ?? 0);
            try {
                $stmt = $conn->prepare(
                    "SELECT id, title, doc_type, content, file_url
                     FROM documents WHERE part_id = ? ORDER BY id"
                );
                $stmt->execute([$partId]);
                json_response($stmt->fetchAll(PDO::FETCH_ASSOC));
            } catch (PDOException $e) {
                error_log('[MARA] get_docs error: ' . $e->getMessage());
                json_error("Database query failed", 500);
            }
            break;

        // --- FAQ (generale ou filtree par composant) ---
        case 'get_faq':
            try {
                $partId = isset($_GET['part_id']) ? intval($_GET['part_id']) : null;
                if ($partId) {
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
                json_response($stmt->fetchAll(PDO::FETCH_ASSOC));
            } catch (PDOException $e) {
                error_log('[MARA] get_faq error: ' . $e->getMessage());
                json_error("Database query failed", 500);
            }
            break;

        // --- Statut API ---
        default:
            json_response([
                "status"  => "online",
                "project" => "SAE 402 - MARA",
                "stack"   => "A-Frame + Three.js + AR.js + Gemini AI",
                "robot"   => "Universal Robots UR5e e-Series",
                "db"      => $conn ? "connected" : "disconnected"
            ]);
    }

// ============================================================
// POST endpoints
// ============================================================
} elseif ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    if (!is_array($input)) {
        json_error("Invalid JSON body", 400);
    }

    $action = $input['action'] ?? 'unknown';

    switch ($action) {

        // --- Assistant IA Gemini ---
        case 'ask_ai':
            $question = trim($input['question'] ?? '');
            $partId   = isset($input['part_id']) ? intval($input['part_id']) : null;

            if (empty($question)) {
                json_error("Question is required", 400);
            }

            // Vérifier la clé Gemini
            if (!defined('GEMINI_API_KEY') || GEMINI_API_KEY === 'VOTRE_CLE_GEMINI_ICI' || empty(GEMINI_API_KEY)) {
                json_response([
                    "status"  => "error",
                    "message" => "Gemini API key not configured. Edit api/config.php and set GEMINI_API_KEY.",
                    "answer"  => "L'assistant IA n'est pas configuré. La clé API Gemini doit être renseignée dans api/config.php."
                ], 503);
                break;
            }

            // 1. Chercher en cache FAQ (question identique) — seulement si DB dispo
            if ($conn) {
                try {
                    $faqStmt = $conn->prepare(
                        "SELECT answer FROM faq WHERE question = ? LIMIT 1"
                    );
                    $faqStmt->execute([$question]);
                    $existing = $faqStmt->fetch(PDO::FETCH_ASSOC);

                    if ($existing) {
                        json_response([
                            "status" => "success",
                            "answer" => $existing['answer'],
                            "source" => "cache"
                        ]);
                    }
                } catch (PDOException $e) {
                    // Cache non critique, on continue vers Gemini
                    error_log('[MARA] FAQ cache lookup failed: ' . $e->getMessage());
                }
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
            if ($partId && $conn) {
                try {
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
                                $systemCtx .= mb_substr($doc['content'], 0, 800) . "\n\n";
                            }
                        }
                    }
                } catch (PDOException $e) {
                    // Contexte enrichi non critique
                    error_log('[MARA] Part context enrichment failed: ' . $e->getMessage());
                }
            }

            // 5. Ajouter les 3 dernieres Q/R pertinentes comme exemples
            if ($conn) {
                try {
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
                } catch (PDOException $e) {
                    // Historique non critique
                    error_log('[MARA] FAQ history lookup failed: ' . $e->getMessage());
                }
            }

            // 6. Appel API Gemini
            $geminiModel = defined('GEMINI_MODEL') ? GEMINI_MODEL : 'gemini-2.0-flash';
            $geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/'
                       . $geminiModel . ':generateContent?key=' . GEMINI_API_KEY;

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

            $response = null;
            $httpCode = 0;

            // Methode 1 : cURL (preferee)
            if (function_exists('curl_init')) {
                $ch = curl_init($geminiUrl);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST           => true,
                    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
                    CURLOPT_POSTFIELDS     => $geminiPayload,
                    CURLOPT_TIMEOUT        => 30,
                    CURLOPT_CONNECTTIMEOUT => 10,
                    CURLOPT_SSL_VERIFYPEER => false
                ]);

                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $curlError = curl_error($ch);
                curl_close($ch);

                if ($curlError) {
                    error_log('[MARA] cURL error: ' . $curlError);
                    json_response([
                        "status"  => "error",
                        "message" => "Gemini cURL error: " . $curlError,
                        "answer"  => "Impossible de contacter l'API Gemini. Erreur réseau : " . $curlError
                    ], 502);
                    break;
                }
            }
            // Methode 2 : file_get_contents (fallback si pas de cURL)
            else {
                $opts = [
                    'http' => [
                        'method'  => 'POST',
                        'header'  => "Content-Type: application/json\r\n",
                        'content' => $geminiPayload,
                        'timeout' => 30,
                        'ignore_errors' => true
                    ],
                    'ssl' => [
                        'verify_peer' => false,
                        'verify_peer_name' => false
                    ]
                ];
                $ctx = stream_context_create($opts);
                $response = @file_get_contents($geminiUrl, false, $ctx);

                // Extraire le code HTTP depuis $http_response_header
                if (isset($http_response_header[0]) && preg_match('/(\d{3})/', $http_response_header[0], $m)) {
                    $httpCode = intval($m[1]);
                }

                if ($response === false) {
                    json_response([
                        "status"  => "error",
                        "message" => "Gemini API unreachable (no cURL, file_get_contents failed)",
                        "answer"  => "Impossible de contacter l'API Gemini. Activez l'extension cURL dans php.ini ou vérifiez votre connexion internet."
                    ], 502);
                    break;
                }
            }

            if ($httpCode !== 200 || !$response) {
                $errorDetail = '';
                if ($response) {
                    $errData = json_decode($response, true);
                    $errorDetail = $errData['error']['message'] ?? '';
                }
                error_log('[MARA] Gemini API error HTTP ' . $httpCode . ': ' . $errorDetail);

                // --- FALLBACK LOCAL : réponse générée sans Gemini ---
                $answer = generateLocalAnswer($question, $partId, $conn);
                if ($answer) {
                    // Sauvegarder en cache si possible
                    if ($conn) {
                        try {
                            $saveStmt = $conn->prepare("INSERT INTO faq (question, answer, part_id) VALUES (?, ?, ?)");
                            $saveStmt->execute([$question, $answer, $partId]);
                        } catch (PDOException $e) { /* non critique */ }
                    }
                    json_response([
                        "status" => "success",
                        "answer" => $answer,
                        "source" => "fallback"
                    ]);
                }

                // Si même le fallback n'a rien trouvé
                json_response([
                    "status"  => "error",
                    "message" => "Gemini API error (HTTP $httpCode)",
                    "answer"  => "L'assistant IA Gemini est temporairement indisponible (quota dépassé). "
                               . "Réessayez dans quelques instants ou reformulez votre question."
                ], 502);
                break;
            }

            $geminiData = json_decode($response, true);
            $answer = $geminiData['candidates'][0]['content']['parts'][0]['text']
                      ?? 'Pas de réponse générée.';

            // 7. Sauvegarder en FAQ pour le cache (si DB dispo)
            $faqId = null;
            if ($conn) {
                try {
                    $saveStmt = $conn->prepare(
                        "INSERT INTO faq (question, answer, part_id) VALUES (?, ?, ?)"
                    );
                    $saveStmt->execute([$question, $answer, $partId]);
                    $faqId = $conn->lastInsertId();
                } catch (PDOException $e) {
                    // Sauvegarde non critique
                    error_log('[MARA] FAQ save failed: ' . $e->getMessage());
                }
            }

            json_response([
                "status"  => "success",
                "answer"  => $answer,
                "source"  => "gemini",
                "faq_id"  => $faqId
            ]);
            break;

        // --- Journalisation des interactions utilisateur ---
        case 'log_interaction':
            if (!$conn) {
                json_response(["status" => "ok", "message" => "DB offline, log skipped"]);
                break;
            }
            try {
                $stmt = $conn->prepare(
                    "INSERT INTO interactions (action_type, part_id, metadata) VALUES (?, ?, ?)"
                );
                $stmt->execute([
                    $input['action_type'] ?? 'click',
                    isset($input['part_id']) ? intval($input['part_id']) : null,
                    json_encode($input['metadata'] ?? [])
                ]);
                json_response([
                    "status" => "success",
                    "id"     => $conn->lastInsertId()
                ]);
            } catch (PDOException $e) {
                error_log('[MARA] log_interaction error: ' . $e->getMessage());
                // Non critique — ne pas casser le frontend pour un log
                json_response(["status" => "ok", "message" => "Log failed silently"]);
            }
            break;

        default:
            json_error("Unknown action: $action", 400);
    }

} else {
    json_error("Method not allowed", 405);
}

// ============================================================
// FALLBACK : réponses locales quand Gemini est indisponible
// ============================================================
function generateLocalAnswer($question, $partId = null, $conn = null) {
    $q = mb_strtolower($question, 'UTF-8');

    // Si un composant est sélectionné, enrichir depuis la DB
    $partName = '';
    $partDesc = '';
    $partSpecs = '';
    if ($partId && $conn) {
        try {
            $stmt = $conn->prepare("SELECT name_fr, description, specs FROM robot_parts WHERE id = ?");
            $stmt->execute([$partId]);
            $data = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($data) {
                $partName = $data['name_fr'];
                $partDesc = $data['description'];
                $partSpecs = is_string($data['specs']) ? $data['specs'] : json_encode($data['specs']);
            }
        } catch (PDOException $e) { /* ignore */ }
    }

    // --- Base de connaissances locale UR5e ---
    $kb = [
        // Joints
        ['keys' => ['joint', 'articulation', 'axe', 'axes', 'degré', 'rotation'],
         'answer' => "Le UR5e possede 6 axes rotatifs, chacun avec une plage de +/-360 degres et une vitesse maximale de 180 deg/s.\n\n"
                   . "- Joints Size 1 (grands) : J1 Base, J2 Epaule, J3 Coude\n"
                   . "- Joints Size 0 (petits) : J4 Poignet 1 (ref. 124100), J5 Poignet 2 (ref. 124101), J6 Poignet 3 (ref. 102414)\n\n"
                   . "Chaque joint integre un moteur brushless BLDC, un reducteur harmonique sans jeu, un encodeur absolu et un frein a ressort fail-safe."],

        // Base
        ['keys' => ['base', 'socle', 'j1', 'joint 1', 'fixation sol'],
         'answer' => "La Base (Joint 1) est le socle rotatif du UR5e.\n\n"
                   . "- Empreinte : O149 mm, 4 vis M6 sur PCD O63 mm\n"
                   . "- Couple de serrage : 9 N.m (sol/mur), 12 N.m (plafond)\n"
                   . "- Montage possible dans toute orientation : sol, plafond, mur, incline\n"
                   . "- Integre l'anneau LED de statut (bleu/vert/orange/rouge)"],

        // Épaule
        ['keys' => ['épaule', 'epaule', 'shoulder', 'j2', 'joint 2'],
         'answer' => "L'Epaule (Joint 2 - Shoulder) est un joint Size 1 (grand).\n\n"
                   . "- Premiere articulation apres la base, rotation dans le plan vertical\n"
                   . "- Moteur BLDC + reducteur harmonique + encodeur absolu multi-tours\n"
                   . "- Frein a ressort fail-safe (s'engage automatiquement en cas de coupure)"],

        // Coude
        ['keys' => ['coude', 'elbow', 'j3', 'joint 3'],
         'answer' => "Le Coude (Joint 3 - Elbow) est l'articulation centrale du UR5e.\n\n"
                   . "- Joint Size 1 (grand), +/-360 deg, 180 deg/s\n"
                   . "- Relie le bras superieur (425 mm) au bras inferieur (~392 mm)\n"
                   . "- Fonctions securite : Elbow Speed Limit + Elbow Force Limit (PLd Cat.3)"],

        // Poignet
        ['keys' => ['poignet', 'wrist', 'j4', 'j5', 'j6', 'joint 4', 'joint 5', 'joint 6'],
         'answer' => "Le poignet du UR5e comprend 3 joints Size 0 (petits) :\n\n"
                   . "- J4 Wrist 1 (ref. 124100) : orientation de l'avant-bras\n"
                   . "- J5 Wrist 2 (ref. 124101) : coordination d'orientation\n"
                   . "- J6 Wrist 3 (ref. 102414) : couple a la bride outil\n\n"
                   . "Duree de vie nominale : 35 000 heures chacun. Ces 3 joints permettent d'atteindre n'importe quelle orientation de l'outil dans l'espace de travail."],

        // Maintenance
        ['keys' => ['maintenance', 'entretien', 'vérif', 'inspection', 'remplac', 'durée de vie', 'usure'],
         'answer' => "Planning de maintenance preventive du UR5e :\n\n"
                   . "- Mensuel : Inspection cables, connecteurs, fixations\n"
                   . "- 3 mois : Verifier couple base (9 N.m), tester fonctions securite\n"
                   . "- 6 mois : Verifier version PolyScope, sauvegarder programmes\n"
                   . "- 1 an : Inspection joints O-ring (ref. 131095)\n"
                   . "- 5 ans : Remplacer batterie CR2032 (ref. 170009)\n"
                   . "- 35 000 h : Remplacer Wrist 1 (124100), Wrist 2 (124101), Wrist 3 (102414)"],

        // Specs générales
        ['keys' => ['spécif', 'spec', 'caractér', 'poids', 'charge', 'portée', 'portee', 'dimension'],
         'answer' => "Specifications principales du UR5e e-Series :\n\n"
                   . "- Charge utile max : 5 kg\n"
                   . "- Portee : 850 mm\n"
                   . "- 6 axes, repetabilite : +/-0,03 mm\n"
                   . "- Masse du bras : 20,6 kg\n"
                   . "- Protection : IP54\n"
                   . "- Bruit : <65 dB(A)\n"
                   . "- Alimentation : 100-240 VAC, 47-440 Hz\n"
                   . "- Consommation : 200 W typique, 570 W max"],

        // Control Box
        ['keys' => ['control box', 'boitier', 'commande', 'alimentation', 'alim', 'ethernet', 'modbus', 'profinet'],
         'answer' => "Boitier de commande (Control Box CB-2) du UR5e :\n\n"
                   . "- Dimensions : 460 x 449 x 254 mm, 12 kg, IP44\n"
                   . "- Alimentation : 100-240 VAC, 47-440 Hz\n"
                   . "- Consommation : 200 W typique, 570 W max\n"
                   . "- E/S : 16 DI + 16 DO (24V), 2 AI + 2 AO (0-10V)\n"
                   . "- Ethernet 1 Gb/s, USB 2.0 + 3.0, Mini DisplayPort\n"
                   . "- Protocoles : Modbus TCP, EthernetIP, PROFINET, PROFIsafe, ROS/ROS2\n"
                   . "- IP par defaut : 192.168.56.101"],

        // Teach Pendant
        ['keys' => ['teach pendant', 'tablette', 'polyscope', 'programmer', 'programmation', 'freedrive', 'écran'],
         'answer' => "Teach Pendant TP5 du UR5e :\n\n"
                   . "- Ecran : 12 pouces tactile, 1280x800 px\n"
                   . "- Poids : 1,8 kg (avec 1 m de cable), cable total 4,5 m\n"
                   . "- Logiciel PolyScope : 5 onglets (Move, Program, Installation, Run, Log)\n"
                   . "- E-Stop hardware : NC categorie 0, PLd\n"
                   . "- Validateur 3 positions pour FreeDrive (guidage manuel a la main)\n"
                   . "- Modes : Automatic (pleine vitesse), Manual T-Speed (<=250 mm/s), Remote"],

        // Sécurité
        ['keys' => ['sécurité', 'securite', 'safety', 'e-stop', 'arret', 'arrêt', 'urgence', 'collision', 'pld'],
         'answer' => "Fonctions de securite du UR5e (17 fonctions PLd Cat.3) :\n\n"
                   . "- E-Stop hardware sur le Teach Pendant (NC, categorie 0)\n"
                   . "- Detection de collision par capteurs de courant moteur\n"
                   . "- Capteur Force/Couple 6 axes integre a la bride : +/-50 N / +/-10 N.m\n"
                   . "- Limites configurables : vitesse joints, force coude, vitesse TCP, force outil\n"
                   . "- Frein fail-safe sur chaque joint (s'enclenche si coupure d'alimentation)\n"
                   . "- Mode manuel limite a 250 mm/s via validateur 3 positions"],

        // Bride outil / Tool
        ['keys' => ['bride', 'outil', 'tool', 'flange', 'capteur force', 'couple', 'effecteur', 'gripper'],
         'answer' => "Bride outil (Tool Flange) du UR5e :\n\n"
                   . "- Norme : ISO 9409-1-50-4-M6\n"
                   . "- Connecteur outil : M8, 8 broches femelle\n"
                   . "- Capteur Force 6 axes : Fx/Fy/Fz +/-50 N (precision +/-3,5 N)\n"
                   . "- Capteur Couple 6 axes : Tx/Ty/Tz +/-10 N.m (precision +/-0,2 N.m)\n"
                   . "- Alimentation outil : 12V ou 24V DC, 1,5A\n"
                   . "- E/S numeriques outil : 2 entrees + 2 sorties\n"
                   . "- Reference bride+capteur : 124085"],

        // Installation
        ['keys' => ['install', 'monter', 'montage', 'fixer', 'vis', 'sol', 'plafond', 'mur'],
         'answer' => "Installation du UR5e :\n\n"
                   . "- Montage possible dans toute orientation : sol, mur, plafond, incline\n"
                   . "- Base : empreinte O149 mm, 4 vis M6 sur PCD O63 mm\n"
                   . "- Couple de serrage : 9 N.m (sol/mur), 12 N.m (plafond)\n"
                   . "- Cable unique de 6 m entre le bras et la Control Box\n"
                   . "- Distance min recommandee Control Box / bras : maintenir le cable sans tension"],

        // Bras / segments
        ['keys' => ['bras', 'segment', 'upper arm', 'forearm', 'avant-bras', 'longueur'],
         'answer' => "Segments mecaniques du bras UR5e :\n\n"
                   . "- Bras superieur (Upper Arm, J2-J3) : 425 mm, segment le plus long\n"
                   . "- Avant-bras (Forearm, J3-J5) : ~392 mm\n"
                   . "- Portee totale TCP : 850 mm depuis l'axe J1\n"
                   . "- Materiau : aluminium anodise, IP54\n"
                   . "- Repetabilite garantie : +/-0,03 mm (ISO 9283)"],
    ];

    // Si un composant est sélectionné et qu'on a ses données
    if ($partName && $partDesc) {
        // Vérifier si la question porte sur ce composant spécifiquement
        $partKeywords = array_filter(explode(' ', mb_strtolower($partName, 'UTF-8')), fn($w) => mb_strlen($w) > 2);
        foreach ($partKeywords as $kw) {
            if (mb_strpos($q, $kw) !== false) {
                return $partName . "\n\n" . $partDesc
                     . ($partSpecs ? "\n\nSpécifications :\n" . $partSpecs : '');
            }
        }
    }

    // Recherche par mots-clés dans la base de connaissances
    $bestMatch = null;
    $bestScore = 0;
    foreach ($kb as $entry) {
        $score = 0;
        foreach ($entry['keys'] as $key) {
            if (mb_strpos($q, $key) !== false) {
                $score += mb_strlen($key); // Plus le mot-clé est long, plus il est pertinent
            }
        }
        if ($score > $bestScore) {
            $bestScore = $score;
            $bestMatch = $entry['answer'];
        }
    }

    if ($bestMatch) {
        return $bestMatch . "\n\n(Réponse générée localement — l'assistant Gemini est temporairement indisponible)";
    }

    // Réponse générique UR5e
    return "Le UR5e e-Series est un robot collaboratif 6 axes de Universal Robots.\n\n"
         . "Caractéristiques principales :\n"
         . "Charge utile : 5 kg | Portée : 850 mm\n"
         . "Répétabilité : +/-0,03 mm | Masse : 20,6 kg\n"
         . "6 joints rotatifs (3 grands Size 1 + 3 petits Size 0)\n"
         . "Capteur Force/Couple 6 axes intégré\n"
         . "Programmation intuitive via FreeDrive et PolyScope\n\n"
         . "Pour une réponse plus précise, selectionnez un composant dans le viewer 3D, "
         . "puis reposez votre question.\n\n"
         . "(Réponse générée localement - l'assistant Gemini est temporairement indisponible)";
}
