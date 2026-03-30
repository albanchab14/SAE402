-- SAE402 MARA - Database Setup
-- Maintenance Assistée par Réalité Augmentée
CREATE DATABASE IF NOT EXISTS sae402;
USE sae402;

-- Suppression des tables existantes (ordre inverse des FK)
DROP TABLE IF EXISTS interactions;
DROP TABLE IF EXISTS faq;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS robot_parts;

-- Table des composants du robot
CREATE TABLE robot_parts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    name_fr VARCHAR(100) NOT NULL,
    category ENUM('identification','alimentation','raccordement','installation','maintenance','pieces_detachees') NOT NULL,
    description TEXT,
    specs JSON,
    image_url VARCHAR(255),
    mesh_name VARCHAR(100),
    hotspot_x FLOAT DEFAULT 0,
    hotspot_y FLOAT DEFAULT 0,
    hotspot_z FLOAT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table des documents techniques liés
CREATE TABLE documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    part_id INT,
    title VARCHAR(200),
    doc_type ENUM('pdf','image','video','text') DEFAULT 'text',
    content TEXT,
    file_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (part_id) REFERENCES robot_parts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table FAQ dynamique (IA)
CREATE TABLE faq (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    part_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (part_id) REFERENCES robot_parts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table des interactions utilisateur
CREATE TABLE interactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(100),
    part_id INT NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (part_id) REFERENCES robot_parts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
