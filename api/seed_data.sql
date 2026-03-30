-- SAE402 MARA - Seed Data (UR5e)
USE sae402;

-- Composants du robot UR5e
INSERT INTO robot_parts (name, name_fr, category, description, specs, mesh_name, hotspot_x, hotspot_y, hotspot_z) VALUES
('Base', 'Base', 'identification',
 'Socle fixe du robot, point d''ancrage au sol ou à la surface de montage. Contient le moteur du Joint 1 et les LEDs de statut.',
 '{"diametre":"149 mm","fixation":"4x M6","montage":"Toute orientation (sol, mur, plafond)","led_status":"Anneau LED indiquant l''état du robot","joint":"J1 - Rotation base","plage":"±360°","vitesse_max":"180°/s"}',
 'Base', 0, 0.05, 0),

('Shoulder', 'Épaule', 'identification',
 'Première articulation majeure (Joint 2). Relie la base au bras supérieur. Moteur brushless avec réducteur harmonique.',
 '{"joint":"J2 - Épaule","plage":"±360°","vitesse_max":"180°/s","moteur":"Brushless DC + réducteur harmonique","couple_nominal":"Élevé (charge structurelle principale)"}',
 'Shoulder', 0, 0.35, 0),

('Upper Arm', 'Bras supérieur', 'identification',
 'Segment le plus long du bras robotique (425 mm). Relie l''épaule au coude.',
 '{"longueur":"425 mm","joint":"J2-J3","plage":"±360°","vitesse_max":"180°/s","materiau":"Aluminium haute résistance"}',
 'UpperArm', 0, 0.7, -0.15),

('Elbow', 'Coude', 'identification',
 'Articulation intermédiaire (Joint 3). Permet la flexion/extension du bras.',
 '{"joint":"J3 - Coude","plage":"±360°","vitesse_max":"180°/s","moteur":"Brushless DC + réducteur harmonique"}',
 'Elbow', 0, 1.05, -0.1),

('Wrist 1', 'Poignet 1 (Avant-bras)', 'identification',
 'Premier axe du poignet (Joint 4). Assure la rotation de l''avant-bras.',
 '{"joint":"J4 - Poignet 1","plage":"±360°","vitesse_max":"180°/s","taille":"Size 0"}',
 'Wrist1', 0, 1.15, 0.1),

('Wrist 2', 'Poignet 2', 'identification',
 'Deuxième axe du poignet (Joint 5). Permet l''inclinaison du poignet.',
 '{"joint":"J5 - Poignet 2","plage":"±360°","vitesse_max":"180°/s","reference":"124101"}',
 'Wrist2', 0, 1.25, 0.15),

('Tool Flange', 'Bride outil', 'identification',
 'Interface de montage d''outil (Joint 6). Intègre un capteur Force/Couple 6 axes et un connecteur M8 8-pin.',
 '{"joint":"J6 - Bride outil","plage":"±360°","vitesse_max":"180°/s","norme_montage":"ISO 9409-1-50-4-M6","capteur_ft":"Force ±50N (±3.5N), Couple ±10Nm (±0.2Nm)","connecteur":"M8 8-pin","reference":"102414"}',
 'ToolFlange', 0, 1.35, 0.2),

('Control Box', 'Boîtier de commande', 'alimentation',
 'Unité de contrôle principale du robot. Contient l''alimentation, les cartes de contrôle et les interfaces de communication.',
 '{"dimensions":"460 × 449 × 254 mm","masse":"12 kg","protection":"IP44","alimentation":"100-240 VAC, 47-440 Hz","io_digitales":"16 DI + 16 DO","io_analogiques":"2 AI + 2 AO","protocoles":"Modbus TCP, Ethernet/IP, PROFINET, ROS/ROS2","consommation_typique":"200 W","consommation_max":"570 W"}',
 'ControlBox', 0.8, 0.2, 0.5),

('Teach Pendant', 'Teach Pendant', 'installation',
 'Tablette de programmation du robot. Interface tactile pour la programmation, le contrôle manuel et la configuration.',
 '{"ecran":"12 pouces, 1280 × 800 px","dimensions":"300 × 231 × 50 mm","masse":"1.8 kg","protection":"IP54","cable":"4.5 m","interface":"Tactile capacitif"}',
 'TeachPendant', -0.8, 0.2, 0.5);

-- Documents techniques
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(1, 'Installation de la base', 'text', 'La base du UR5e doit être fixée sur une surface rigide capable de supporter les forces dynamiques du robot. Utilisez les 4 vis M6 fournies. Couple de serrage recommandé : 9 Nm. La base peut être montée dans toute orientation (sol, mur, plafond) grâce au capteur de gravité intégré.'),
(2, 'Maintenance de l''épaule', 'text', 'L''articulation de l''épaule (J2) supporte la charge structurelle principale. Vérifier annuellement l''état du réducteur harmonique. En cas de jeu excessif ou de bruit anormal, contacter le support Universal Robots. Ne jamais démonter le moteur sans formation certifiée.'),
(3, 'Spécifications du bras supérieur', 'text', 'Le bras supérieur mesure 425 mm de longueur. Il est fabriqué en aluminium haute résistance pour un rapport rigidité/poids optimal. Les câbles internes passent par un chemin de câbles intégré. Ne pas exercer de force latérale excessive.'),
(7, 'Capteur Force/Couple intégré', 'text', 'La bride outil intègre un capteur F/T 6 axes mesurant les forces (±50N, précision ±3.5N) et couples (±10Nm, précision ±0.2Nm) sur les 3 axes. Ce capteur permet la détection de collision, le contrôle en force et l''insertion précise de pièces.'),
(8, 'Guide de raccordement du boîtier', 'text', 'Le boîtier de commande accepte une alimentation 100-240 VAC (47-440 Hz). Connecter le câble robot (fourni), le câble Teach Pendant et l''alimentation. Les I/O sont accessibles via les connecteurs en façade : 16 entrées/sorties digitales (24V) et 2 entrées/sorties analogiques (0-10V ou 4-20mA).'),
(9, 'Utilisation du Teach Pendant', 'text', 'Le Teach Pendant est l''interface principale de programmation. Il permet de programmer par apprentissage (mouvement libre), de créer des programmes via PolyScope et de configurer tous les paramètres du robot. L''écran tactile 12" offre une résolution de 1280×800 pixels.');

-- FAQ initiales
INSERT INTO faq (question, answer, part_id) VALUES
('Quel est le payload maximum du UR5e ?', 'Le UR5e peut manipuler des charges jusqu''à 5 kg. Cette capacité inclut le poids de l''outil fixé sur la bride. La portée maximale est de 850 mm.', NULL),
('Comment calibrer le capteur de force ?', 'Le capteur Force/Couple intégré dans la bride outil se calibre automatiquement au démarrage. Pour une recalibration manuelle, accédez à Installation > Capteur F/T dans PolyScope sur le Teach Pendant.', 7),
('Quelle est la fréquence de maintenance recommandée ?', 'Universal Robots recommande une inspection visuelle mensuelle (câbles, connecteurs, état général) et une maintenance préventive annuelle (vérification des couples de serrage, état des réducteurs, mise à jour logicielle).', NULL);
