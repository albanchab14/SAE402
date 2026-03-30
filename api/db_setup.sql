-- SAE402 Database Initialization
-- Create database if not exists
CREATE DATABASE IF NOT EXISTS sae402;
USE sae402;

-- Players Table
CREATE TABLE IF NOT EXISTS players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interactions Log
CREATE TABLE IF NOT EXISTS interactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NULL,
    action_type VARCHAR(100),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Hotspots Table for AR Visualiser
CREATE TABLE IF NOT EXISTS hotspots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    content_url VARCHAR(255),
    pos_x FLOAT NOT NULL,
    pos_y FLOAT NOT NULL,
    pos_z FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Initial Dummy Data
INSERT INTO players (username) VALUES ('admin_user');

-- Sample Hotspots for the scanner
INSERT INTO hotspots (name, description, pos_x, pos_y, pos_z) VALUES 
('Point A: Capteur Optique', 'Ce capteur permet de scanner les surfaces avec une précision de 0.01mm.', 1, 1, 1),
('Point B: Zone de Scan 3D', 'Cette zone active le faisceau laser pour la capture de nuages de points.', -1, 1.5, 0.5),
('Point C: Batterie Lithium', 'Batterie haute performance offrant une autonomie de 8 heures en scan continu.', 0, -1.2, 0.8);
