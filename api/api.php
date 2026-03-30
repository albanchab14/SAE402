<?php
header('Content-Type: application/json');
require_once 'config.php';

// Disable default CORS (Vite proxy handles this in dev)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

// Read input and sanitize
$input = json_decode(file_get_contents('php://input'), true);
$method = $_SERVER['REQUEST_METHOD'];

// Database connection
$conn = get_db_connection();

if (!$conn) {
    echo json_encode(["status" => "error", "message" => "Database connection failed (MySQL)"]);
    exit;
}

// Logic based on Method/Action
if ($method === 'POST') {
    $action = $input['action'] ?? 'unknown';
    
    if ($action === 'log_interaction') {
        try {
            $stmt = $conn->prepare("INSERT INTO interactions (action_type, metadata) VALUES (?, ?)");
            $stmt->execute([
                $input['object'] ?? 'click',
                json_encode($input)
            ]);
            
            echo json_encode([
                "status" => "success", 
                "message" => "Interaction logged to MySQL",
                "id" => $conn->lastInsertId()
            ]);
        } catch (Exception $e) {
            echo json_encode(["status" => "error", "message" => "Failed to write: " . $e->getMessage()]);
        }
    } else {
        echo json_encode(["status" => "error", "message" => "Unknown action"]);
    }
} elseif ($method === 'GET') {
    $action = $_GET['action'] ?? 'status';

    if ($action === 'get_hotspots') {
        $stmt = $conn->query("SELECT * FROM hotspots");
        $hotspots = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($hotspots);
    } elseif ($action === 'get_hotspot') {
        $id = $_GET['id'] ?? 0;
        $stmt = $conn->prepare("SELECT * FROM hotspots WHERE id = ?");
        $stmt->execute([$id]);
        $hotspot = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode($hotspot);
    } else {
        echo json_encode([
            "status" => "online", 
            "project" => "SAE 402 - AR Visualiser", 
            "engine" => "PlayCanvas"
        ]);
    }
}

$conn = null;
?>
