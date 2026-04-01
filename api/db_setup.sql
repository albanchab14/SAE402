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

-- ============================================================
-- Insertion des documents techniques (4 rubriques × 10 parties)
-- ============================================================

-- Part 1 : Base (Joint 1)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(1, 'Principe de fonctionnement et Architecture', 'text', 'La Base (Joint 1) est l''articulation de "Taille 1" (Size 1) qui supporte l''intégralité de la cinématique du robot. Elle permet une rotation axiale complète de ±360° à une vitesse maximale de 180°/s. C''est le point d''ancrage principal du cobot, assurant la liaison mécanique et électrique (via un câble de 6 mètres) avec le boîtier de commande. Elle intègre un anneau LED indiquant le statut du robot (bleu, vert, orange ou rouge) visible à 360 degrés par les opérateurs.'),
(1, 'Directives d''Installation & Câblage', 'text', 'L''embase présente une empreinte de montage de Ø 149 mm. La fixation s''effectue via 4 vis M6 sur un gabarit (PCD) de Ø 63 mm. Le robot peut être monté dans n''importe quelle orientation (sol, plafond, mur, plan incliné). Attention aux couples de serrage stricts : 9 N.m pour un montage au sol/mur, et 12 N.m pour une fixation au plafond.'),
(1, 'Sécurité et Fonctions PFL', 'text', 'Cette articulation est soumise aux normes de limitation de puissance et de force (PFL - ISO/TR 20218-1). En cas de coupure d''alimentation, un frein à ressort "fail-safe" s''engage instantanément pour figer l''axe et éviter une chute du bras par gravité. Les limites de rotation logicielles doivent être configurées dans PolyScope pour éviter l''enroulement des câbles externes.'),
(1, 'Recommandations de Maintenance', 'text', 'Protégée IP54, la base nécessite peu d''entretien mécanique. Lors des maintenances préventives, vérifiez l''intégrité visuelle du couvercle (Lid set UR5e - Réf: 103405), le serrage des 4 vis de fixation M6 au couple recommandé, et l''absence de contrainte sur le câble principal en sortie d''embase.');

-- Part 2 : Épaule (Joint 2 - Shoulder)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(2, 'Principe de fonctionnement et Architecture', 'text', 'L''Épaule (Joint 2) est l''articulation critique gérant la levée du bras dans le plan vertical. Équipée d''un moteur Brushless sans balais (BLDC) et d''un réducteur harmonique (Harmonic Drive) à jeu zéro, elle encaisse le couple mécanique le plus fort de la structure (supportant la charge utile de 5 kg pour l''UR5e). Elle intègre un encodeur absolu multi-tours pour un positionnement spatial instantané au démarrage.'),
(2, 'Directives d''Installation & Câblage', 'text', 'Lors de l''installation, assurez-vous de laisser un dégagement suffisant autour de l''épaule pour permettre sa rotation complète de ±360°. Aucune fixation externe n''est requise, mais l''axe doit être dégagé de tout obstacle rigide qui pourrait endommager le carter en aluminium lors de la programmation des trajectoires.'),
(2, 'Sécurité et Fonctions PFL', 'text', 'L''épaule est le premier axe surveillant la gravité. Ses capteurs de courant moteur détectent les variations anormales de charge, déclenchant un arrêt de protection en cas de collision (Protective Stop). Le frein électromagnétique intégré est dimensionné pour retenir la charge maximale même en cas de coupure électrique d''urgence (Catégorie 0).'),
(2, 'Recommandations de Maintenance', 'text', 'La durée de vie nominale de l''articulation est de 35 000 heures. Il est recommandé d''écouter régulièrement le réducteur harmonique lors des mouvements à pleine vitesse (180°/s) : tout bruit de cliquetis ou de grincement anormal peut indiquer une usure prématurée nécessitant un remplacement du joint (Taille 1).');

-- Part 3 : Bras supérieur (Upper Arm)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(3, 'Principe de fonctionnement et Architecture', 'text', 'Le bras supérieur est un segment mécanique rigide en aluminium anodisé reliant l''épaule (Joint 2) au coude (Joint 3). Mesurant 425 mm, c''est le segment le plus long du robot. Il ne contient pas de moteur, mais sa rigidité structurelle est primordiale pour garantir la répétabilité globale du robot (±0.03 mm selon la norme ISO 9283), même à la portée maximale.'),
(3, 'Directives d''Installation & Câblage', 'text', 'Ce segment est conçu pour être lisse afin de faciliter le nettoyage et minimiser les risques d''accrochage. Si des câbles ou tuyaux pneumatiques externes doivent être routés jusqu''à l''outil, il est recommandé d''utiliser des colliers de serrage spécifiques ou une gaine annelée fixée de manière lâche pour accompagner les mouvements sans restreindre les articulations adjacentes.'),
(3, 'Sécurité et Fonctions PFL', 'text', 'Attention au risque de pincement (pinch points) : lors du repli du robot sur lui-même, l''espace entre le bras supérieur et l''avant-bras se réduit. Les fonctions de sécurité PFL doivent être paramétrées dans PolyScope pour limiter la vitesse de fermeture de cet angle si des opérateurs travaillent à proximité immédiate.'),
(3, 'Recommandations de Maintenance', 'text', 'Le tube bénéficie d''un indice de protection IP54. L''entretien se limite à un nettoyage externe de surface avec un chiffon doux et un détergent doux. Ne pas utiliser de solvants abrasifs qui pourraient dégrader l''anodisation de l''aluminium.');

-- Part 4 : Coude (Joint 3 - Elbow)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(4, 'Principe de fonctionnement et Architecture', 'text', 'Le Coude (Joint 3) est l''articulation centrale de taille "Size 1" reliant les segments supérieur et inférieur. Elle offre une amplitude de ±360° et permet de plier ou d''étendre le bras. Sa position est déterminante pour la portée maximale du robot (850 mm pour UR5e).'),
(4, 'Directives d''Installation & Câblage', 'text', 'Bien que l''articulation permette un mouvement à 360°, la programmation des trajectoires doit éviter de solliciter le coude à ses limites physiques extrêmes de manière répétée avec de fortes charges, afin d''optimiser la durée de vie du réducteur harmonique.'),
(4, 'Sécurité et Fonctions PFL', 'text', 'Le coude est au cœur du système de sécurité de l''e-Series. Il dispose de deux fonctions de sécurité dédiées classées PLd Cat. 3 : "Elbow Speed Limit" (Limitation de la vitesse du coude) et "Elbow Force Limit" (Limitation de la force du coude). Ces paramètres restreignent l''énergie cinétique globale du bras avant même qu''il ne touche l''outil, protégeant ainsi le haut du corps d''un opérateur lors d''une collision.'),
(4, 'Recommandations de Maintenance', 'text', 'Les capots bleus d''étanchéité (Lid Set) doivent être vérifiés. Si le robot évolue dans un environnement poussiéreux ou humide (bien que limité à IP54), surveillez l''absence de condensation sous les joints toriques pour éviter l''oxydation de l''encodeur absolu interne.');

-- Part 5 : Avant-bras (Forearm)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(5, 'Principe de fonctionnement et Architecture', 'text', 'L''avant-bras est le second segment tubulaire en aluminium anodisé du robot, d''une longueur d''environ 392 mm. Il fait la liaison entre le coude massif et le premier poignet fin (Wrist 1). Sa légèreté est optimisée pour réduire l''inertie lors des déplacements rapides des trois axes du poignet.'),
(5, 'Directives d''Installation & Câblage', 'text', 'C''est souvent sur ce segment que sont fixés les boîtiers de distribution pneumatique ou les modules de contrôle d''effecteurs (distributeurs, vannes). Les fixations doivent être légères et leur poids (ainsi que leur centre de gravité) doit être déclaré dans le menu "Payload" de PolyScope, sans quoi le système PFL détectera une anomalie de masse.'),
(5, 'Sécurité et Fonctions PFL', 'text', 'Le déplacement de ce segment balaie une zone spatiale importante. Lors de l''évaluation des risques (ISO 10218-1), la vitesse de balayage de l''avant-bras doit être restreinte dans les "plans de sécurité" (Safety Planes) si l''espace de travail interfère avec un passage piéton en atelier.'),
(5, 'Recommandations de Maintenance', 'text', 'Même consigne que pour le bras supérieur : nettoyage de surface régulier. En cas de rayure profonde, surveillez l''apparition de microfissures si le robot porte fréquemment des charges proches de sa limite (5 kg).');

-- Part 6 : Poignet 1 (Joint 4 - Wrist 1)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(6, 'Principe de fonctionnement et Architecture', 'text', 'Le Poignet 1 marque la transition de la géométrie du robot vers des articulations de "Taille 0" (plus petites, Réf: 124100). Sa fonction principale n''est pas la portée, mais l''orientation spatiale de l''outil. Il est capable de vitesses angulaires très élevées (jusqu''à 180°/s) et utilise un motoréducteur très compact pour maximiser la dextérité.'),
(6, 'Directives d''Installation & Câblage', 'text', 'Les axes des poignets peuvent être soumis à des "singularités cinématiques" (lorsque plusieurs axes s''alignent parfaitement, le robot ne sait plus comment calculer son mouvement). Lors de la programmation d''une trajectoire linéaire (MoveL), veillez à ce que l''angle du Wrist 1 ne s''approche pas de 0° ou 180° par rapport à l''avant-bras de manière prolongée.'),
(6, 'Sécurité et Fonctions PFL', 'text', 'Étant plus proche de l''outil, cette articulation réagit très rapidement aux collisions détectées. Ses limites de vitesse sont souvent les premières à être drastiquement réduites lors du passage en Mode Collaboratif (Reduced Mode) via PolyScope.'),
(6, 'Recommandations de Maintenance', 'text', 'Les poignets étant très mobiles, la graisse à l''intérieur des réducteurs harmoniques est fortement sollicitée. Bien que lubrifiés à vie (35 000 heures), les joints toriques (O-rings) de taille 0 peuvent sécher. Une inspection visuelle tous les ans est recommandée pour détecter d''éventuels suintements de graisse.');

-- Part 7 : Poignet 2 (Joint 5 - Wrist 2)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(7, 'Principe de fonctionnement et Architecture', 'text', 'Le Poignet 2 (Taille 0, Réf: 124101) travaille en coordination croisée à 90° avec Wrist 1 et Wrist 3. C''est l''axe de tangage qui permet de faire basculer l''outil de haut en bas ou de gauche à droite. Il participe à la flexibilité sphérique de l''extrémité du bras, primordiale pour des tâches comme le vissage, l''assemblage ou le soudage.'),
(7, 'Directives d''Installation & Câblage', 'text', 'Mêmes précautions que le Wrist 1 concernant les singularités. De plus, c''est autour de ce poignet que les câbles de l''outil final (effecteur) risquent le plus de s''enrouler. Il est impératif d''utiliser la fonction logicielle de "Limitation des Joints" dans PolyScope pour empêcher cet axe de faire plusieurs tours complets (limiter à ±180° au lieu de ±360° si l''application le permet).'),
(7, 'Sécurité et Fonctions PFL', 'text', 'La protection intégrée coupe l''alimentation du BLDC et active le frein si le capteur de courant perçoit un blocage physique, par exemple si l''axe heurte une table de travail lors d''une inclinaison.'),
(7, 'Recommandations de Maintenance', 'text', 'Maintenance standard IP54. Remplacement en bloc de l''articulation complète (Size 0) requis en cas de défaillance de l''encodeur absolu interne.');

-- Part 8 : Poignet 3 + Bride outil (Joint 6 - Tool Flange)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(8, 'Principe de fonctionnement et Architecture', 'text', 'C''est l''interface finale du robot. L''articulation (Wrist 3, Réf: 102414) termine la cinématique (rotation de l''outil), tandis que la Bride Outil (Réf: 124085) standardisée ISO 9409-1-50-4-M6 permet la fixation des effecteurs. Elle intègre nativement un Capteur de Force/Couple (F/T) très précis mesurant sur 6 axes (±50 N de force, ±10 N.m de couple) pour les applications de précision, ainsi qu''un connecteur M8 (8 broches) fournissant l''énergie et la data directement à l''outil.'),
(8, 'Directives d''Installation & Câblage', 'text', 'Le connecteur M8 fournit 12V ou 24V (1.5A) et gère 2 E/S numériques (NPN/PNP) + 2 E/S analogiques ou 1 communication RS-485. Lors du montage d''un préhenseur, serrez les 4 vis M6 en croix. Il est crucial de paramétrer le poids (Payload) et le Centre de Gravité (CoG) exacts de l''outil dans PolyScope pour que le capteur de force fonctionne correctement.'),
(8, 'Sécurité et Fonctions PFL', 'text', 'Le capteur F/T est le "sens du toucher" du cobot. C''est lui qui détecte instantanément l''impact de l''outil avec l''environnement ou un humain, déclenchant l''Arrêt Protecteur. Si aucun outil n''est connecté, le connecteur M8 doit impérativement être obturé par son capot de protection (Réf: 131095) pour maintenir l''isolation électrique.'),
(8, 'Recommandations de Maintenance', 'text', 'Ne jamais utiliser l''axe du Joint 6 pour forcer manuellement le robot à bouger si le mode FreeDrive n''est pas activé. Cela risque d''endommager les jauges de contrainte ultra-sensibles du capteur de Force/Couple logé dans la bride.');

-- Part 9 : Boîtier de commande (Control Box)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(9, 'Principe de fonctionnement et Architecture', 'text', 'La Control Box (Modèle CB-2 UR5e, 12 kg) est le cerveau du système. Elle abrite l''alimentation de puissance (transformant le 230V secteur en bus continu pour les articulations), la carte mère avec le PC temps-réel (faisant tourner le système PolyScope) et la carte de sécurité redondante. Elle gère la communication avec les API d''usine via divers protocoles industriels (Modbus TCP, PROFINET, ROS).'),
(9, 'Directives d''Installation & Câblage', 'text', 'À installer dans un environnement propre (IP44), avec une alimentation secteur de 100-240 VAC. L''armoire offre un bornier E/S riche : 16 entrées/sorties numériques et 2 analogiques (alimentées en 24V, 2A max au total). Le câblage des capteurs de sécurité externes (barrières immatérielles, radars) se fait sur les borniers dédiés jaunes ("Safety I/O").'),
(9, 'Sécurité et Fonctions PFL', 'text', 'La Control Box gère toutes les conditions d''arrêt matériel et logiciel. Les E/S de sécurité sont doublées (Dual-Channel) pour garantir une certification PLd. En cas d''erreur fatale du système d''exploitation, les contacteurs matériels coupent physiquement la puissance du bras en quelques millisecondes.'),
(9, 'Recommandations de Maintenance', 'text', 'Maintenir le boîtier dans un environnement où l''humidité est inférieure à 90% (sans condensation). Il faut inspecter et nettoyer régulièrement les filtres des ventilateurs situés sur le côté de l''armoire pour éviter la surchauffe du PC embarqué et des alimentations de puissance.');

-- Part 10 : Teach Pendant (Tablette de programmation)
INSERT INTO documents (part_id, title, doc_type, content) VALUES
(10, 'Principe de fonctionnement et Architecture', 'text', 'Le Teach Pendant (TP5) est l''Interface Homme-Machine (IHM) principale pesant 1.8 kg. Doté d''un écran tactile capacitif de 12 pouces, il affiche PolyScope X, l''environnement de programmation visuelle. Il permet à l''opérateur de configurer les nœuds de programme, l''installation matérielle, les limites de sécurité, et de piloter le bras manuellement.'),
(10, 'Directives d''Installation & Câblage', 'text', 'La tablette est connectée à la Control Box via un câble renforcé de 4.5 mètres. Veillez à ne pas écraser ou pincer ce câble, car il achemine non seulement l''affichage vidéo (Mini DisplayPort interne), mais surtout les signaux critiques de sécurité (Arrêt d''Urgence et Validateur).'),
(10, 'Sécurité et Fonctions PFL', 'text', 'Dispositif de sécurité vital, le Teach Pendant intègre le bouton d''Arrêt d''Urgence matériel rouge (E-Stop, Catégorie 0, PLd). Au dos, le Validateur à 3 positions (3-Position Enabling Device) permet le mode "FreeDrive" : il faut le maintenir à mi-course pour autoriser le guidage manuel du bras par l''opérateur (un relâchement ou une pression excessive coupe instantanément les moteurs).'),
(10, 'Recommandations de Maintenance', 'text', 'Nettoyer l''écran IP54 uniquement avec un chiffon en microfibre humide (sans produits chimiques agressifs). Vérifier visuellement le presse-étoupe (le renfort en plastique) à la base de la tablette pour s''assurer que le câble ne subit pas de contrainte mécanique liée au poids de la tablette en l''air.');

-- Table des interactions utilisateur
CREATE TABLE interactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(100),
    part_id INT NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (part_id) REFERENCES robot_parts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
