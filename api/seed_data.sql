-- ============================================================
-- MARA SAE402 - Seed Data (donnees reelles UR5e)
-- Universal Robots UR5e e-Series
-- 10 composants : 6 joints + 2 segments + boitier + teach pendant
-- Executer apres db_setup.sql
-- ============================================================
USE sae402;

DELETE FROM documents;
DELETE FROM faq;
DELETE FROM interactions;
DELETE FROM robot_parts;
ALTER TABLE robot_parts AUTO_INCREMENT = 1;
ALTER TABLE documents AUTO_INCREMENT = 1;
ALTER TABLE faq AUTO_INCREMENT = 1;

-- ============================================================
-- COMPOSANTS DU ROBOT (10 parties)
-- hotspot_x/y/z : coordonnees relatives dans le viewer Three.js
-- Le modele GLB est horizontal, axe principal X de -1.5 a +1.5
-- Base a gauche (x=-2.10), ToolFlange a droite (x=+0.50) — coordonnees GLB reelles
-- ============================================================

INSERT INTO robot_parts
  (id, name, name_fr, category, description, specs, mesh_name, hotspot_x, hotspot_y, hotspot_z)
VALUES

-- 1. JOINT 1 - BASE
(1, 'Joint1_Base', 'Base (Joint 1)', 'installation',
 'Socle rotatif du UR5e. Premier joint (Joint 1) de l architecture 6 axes. Taille Size 1 (grand). Assure la rotation axiale complete (+/-360 deg) du bras entier. L empreinte de fixation est une flasque Ø149mm avec 4 vis M6. Peut etre monte dans toute orientation : sol, plafond, mur, incline. Integre l anneau LED de statut visible de loin.',
 '{"Designation":"Joint 1 - Base","Taille joint":"Size 1 (grand)","Plage mouvement":"+/- 360 degres","Vitesse max":"180 deg/s","Empreinte":"Ø 149 mm","Fixation":"4 vis M6 sur PCD Ø 63 mm","Couple serrage sol/mur":"9 N.m","Couple serrage plafond":"12 N.m","Montage":"Toute orientation (sol, plafond, mur, incline)","Protection IP":"IP54","Indicateur LED":"Anneau couleur base (bleu/vert/orange/rouge)","Materiau":"Aluminium, plastique, acier"}',
 'Base', -2.10, 0.13, 0.0),

-- 2. JOINT 2 - SHOULDER (EPAULE)
(2, 'Joint2_Shoulder', 'Epaule (Joint 2 - Shoulder)', 'identification',
 'Deuxieme joint du UR5e, appele Shoulder (Epaule). Taille Size 1 (grand). Premiere articulation apres la base, permet la rotation du bras dans le plan vertical. Integre moteur brushless BLDC, reducteur harmonique (harmonic drive) sans jeu, encodeur absolu multi-tours et frein a ressort fail-safe (engage automatiquement en cas de coupure d alimentation).',
 '{"Designation":"Joint 2 - Shoulder (Epaule)","Taille joint":"Size 1 (grand)","Plage mouvement":"+/- 360 degres","Vitesse max":"180 deg/s","Moteur":"Brushless sans balais (BLDC)","Reducteur":"Harmonique (harmonic drive) - jeu zero","Encodeur":"Absolu multi-tours","Frein":"A ressort fail-safe (engage si panne alim.)","Capteurs":"Courant moteur (detection collision)"}',
 'Shoulder', -1.90, -0.03, 0.0),

-- 3. SEGMENT BRAS SUPERIEUR (J2 -> J3)
(3, 'UpperArm_Segment', 'Bras superieur (segment J2-J3)', 'identification',
 'Segment mecanique entre le Shoulder (Joint 2) et le Elbow (Joint 3). Longueur 425 mm. C est le segment le plus long du bras UR5e. Supporte les efforts les plus importants lors des deplacements avec charge utile. Sa rigidite en aluminium garantit la repetabilite a +/-0.03mm sur toute la portee.',
 '{"Designation":"Bras superieur (Upper Arm)","Longueur segment J2-J3":"425 mm","Materiau":"Aluminium anodise","Protection IP":"IP54","Contribution portee max":"425 mm sur 850 mm total","Repetabilite garantie":"+/- 0.03 mm (ISO 9283)"}',
 'UpperArm', -1.48, -0.03, 0.0),

-- 4. JOINT 3 - ELBOW (COUDE)
(4, 'Joint3_Elbow', 'Coude (Joint 3 - Elbow)', 'identification',
 'Troisieme joint du UR5e, appele Elbow (Coude). Taille Size 1 (grand), identique a la base et a l epaule. Articulation centrale du bras, relie le bras superieur (425mm) au bras inferieur (~392mm). Fonction securite : Elbow Speed Limit (limite vitesse coude) et Elbow Force Limit (limite force coude) - fonctions 12 et 13 des 17 fonctions de securite PLd Cat.3.',
 '{"Designation":"Joint 3 - Elbow (Coude)","Taille joint":"Size 1 (grand)","Plage mouvement":"+/- 360 degres","Vitesse max":"180 deg/s","Moteur":"Brushless sans balais (BLDC)","Reducteur":"Harmonique (harmonic drive)","Encodeur":"Absolu","Frein":"A ressort fail-safe","Fonctions securite":"Elbow Speed Limit + Elbow Force Limit (PLd Cat.3)"}',
 'Elbow', -0.93, 0.22, 0.0),

-- 5. SEGMENT AVANT-BRAS (J3 -> J5)
(5, 'ForeArm_Segment', 'Avant-bras (segment J3-J5)', 'identification',
 'Segment mecanique entre le Elbow (Joint 3) et Wrist 2 (Joint 5). Longueur ~392 mm. Relie l articulation centrale (coude) aux articulations fines du poignet. Avec le bras superieur, forme le bras mecanique principal du UR5e (425 + 392 = 817 mm des 850 mm de portee totale).',
 '{"Designation":"Avant-bras (Forearm / Lower Arm)","Longueur segment J3-J5":"~392 mm","Materiau":"Aluminium anodise","Protection IP":"IP54","Portee max TCP":"850 mm depuis axe J1","Hauteur robot position zero":"~1000 mm (estime)"}',
 'Forearm', -0.33, 0.31, 0.0),

-- 6. JOINT 4 - WRIST 1 (POIGNET 1)
(6, 'Joint4_Wrist1', 'Poignet 1 (Joint 4 - Wrist 1)', 'pieces_detachees',
 'Quatrieme joint du UR5e, premier du poignet (Wrist 1). Taille Size 0 (petit), plus compact que les joints Size 1 de la base, epaule et coude. Marque la transition vers les articulations fines d orientation. Permet l orientation de l avant-bras. Reference piece de rechange : 124100.',
 '{"Designation":"Joint 4 - Wrist 1 (Poignet 1)","Taille joint":"Size 0 (petit)","Plage mouvement":"+/- 360 degres","Vitesse max":"180 deg/s","Moteur":"Brushless sans balais (BLDC)","Reducteur":"Harmonique (harmonic drive)","Encodeur":"Absolu","Frein":"A ressort fail-safe","Reference piece rechange":"124100","Duree vie nominale":"35 000 heures"}',
 'Wrist1', 0.16, -0.07, 0.0),

-- 7. JOINT 5 - WRIST 2 (POIGNET 2)
(7, 'Joint5_Wrist2', 'Poignet 2 (Joint 5 - Wrist 2)', 'pieces_detachees',
 'Cinquieme joint du UR5e, deuxieme du poignet (Wrist 2). Taille Size 0. Travaille en coordination avec Wrist 1 et Wrist 3 pour orienter l outil dans toutes les directions. Ces trois joints permettent d atteindre n importe quelle orientation de l outil dans l espace de travail. Reference piece : 124101.',
 '{"Designation":"Joint 5 - Wrist 2 (Poignet 2)","Taille joint":"Size 0 (petit)","Plage mouvement":"+/- 360 degres","Vitesse max":"180 deg/s","Moteur":"Brushless sans balais (BLDC)","Reducteur":"Harmonique (harmonic drive)","Encodeur":"Absolu","Frein":"A ressort fail-safe","Reference piece rechange":"124101","Duree vie nominale":"35 000 heures"}',
 'Wrist2', 0.28, 0.25, 0.0),

-- 8. JOINT 6 - WRIST 3 + BRIDE OUTIL (TOOL FLANGE)
(8, 'Joint6_Wrist3_ToolFlange', 'Poignet 3 + Bride outil (Joint 6)', 'pieces_detachees',
 'Sixieme et dernier joint du UR5e (Wrist 3), directement couple a la Bride outil. Taille Size 0. La bride outil est conforme ISO 9409-1-50-4-M6 et accueille tous les outils et effecteurs. Integre un capteur Force/Couple 6 axes standard (±50N / ±10N.m) - caracteristique differenciante du UR5e vs robots industriels classiques. Connecteur outil M8 8 broches femelle. Reference Wrist 3 : 102414.',
 '{"Designation":"Joint 6 - Wrist 3 + Bride outil (Tool Flange)","Taille joint":"Size 0 (petit)","Plage mouvement":"+/- 360 degres","Vitesse max":"180 deg/s","Norme bride":"ISO 9409-1-50-4-M6","Connecteur outil":"M8 8 broches femelle","Capteur Force Fx/Fy/Fz":"+/- 50.0 N | precision +/- 3.5 N | exactitude +/- 4.0 N","Capteur Couple Tx/Ty/Tz":"+/- 10.0 N.m | precision +/- 0.2 N.m | exactitude +/- 0.3 N.m","Alimentation outil":"12V ou 24V DC, 1.5A (dual pin)","E/S num outil":"2 entrees + 2 sorties (NPN/PNP)","E/S ana outil":"2 entrees (0-10V / 4-20mA) ou 1x RS-485","Reference Wrist 3":"102414","Reference bride+capteur":"124085"}',
 'ToolFlange', 0.50, -0.07, 0.0),

-- 9. BOITIER DE COMMANDE (CONTROL BOX)
(9, 'ControlBox', 'Boitier de commande (Control Box)', 'alimentation',
 'Unite de controle centrale du UR5e. Contient le calculateur industriel (PC temps-reel PolyScope), l alimentation puissance du bras, les modules E/S et les interfaces de communication. Alimente et pilote les 6 joints via un cable unique de 6 metres. Alimentation secteur universel 100-240 VAC. Supporte Modbus TCP, EthernetIP, PROFINET/PROFIsafe et ROS/ROS2.',
 '{"Designation":"Control Box CB-2 UR5e","Dimensions (L x H x P)":"460 x 449 x 254 mm","Poids":"12 kg","Protection IP":"IP44","Alimentation entree":"100-240 VAC, 47-440 Hz","Consommation typique":"200 W","Consommation maximale":"570 W","E/S num":"16 entrees + 16 sorties (24V, 2A total)","E/S ana":"2 entrees + 2 sorties (0-10V)","Entrees quadrature encodeur":"4","Alim E/S":"24V DC, 2A","Ethernet":"1 Gb/s (RJ45)","USB":"USB 2.0 + USB 3.0","Sortie video":"Mini DisplayPort","Protocoles":"Modbus TCP, EthernetIP, PROFINET, PROFIsafe, ROS/ROS2","IP defaut robot":"192.168.56.101","Materiau":"Acier peint poudre","Reference":"CB-2 UR5e"}',
 'ControlBox', -1.20, -0.80, 0.0),

-- 10. TEACH PENDANT (TABLETTE DE PROGRAMMATION)
(10, 'TeachPendant', 'Teach Pendant (tablette de programmation)', 'identification',
 'Interface homme-machine du UR5e. Tablette tactile 12 pouces avec PolyScope (OS temps-reel proprietaire UR). Permet la programmation graphique, la configuration et le pilotage manuel. Integre un bouton E-Stop hardware (NC categorie 0, PLd) et un validateur 3 positions pour le FreeDrive. Le FreeDrive permet de programmer le robot en le guidant physiquement a la main - fonctionnalite cle pour la pedagogie.',
 '{"Designation":"Teach Pendant TP5 e-Series","Ecran":"12 pouces tactile capacitif, 1280 x 800 pixels","Dimensions (L x H x P)":"300 x 231 x 50 mm","Poids":"1.8 kg (avec 1m de cable)","Longueur cable":"4.5 m","Protection IP":"IP54","Humidite":"<= 90% HR (sans condensation)","Logiciel":"PolyScope (5 onglets : Move, Program, Installation, Run, Log)","E-Stop":"Bouton hardware NC categorie 0, PLd","Validateur 3 positions":"Pour FreeDrive et mouvements manuels","FreeDrive":"Guidage manuel du bras a la main (mode teach-in)","Modes":"Automatic (pleine vitesse) / Manual T-Speed (<= 250 mm/s) / Remote","Reference":"TP5 (e-Series)"}',
 'TeachPendant', 0.20, -0.80, 0.0);


-- ============================================================
-- DOCUMENTS TECHNIQUES PAR COMPOSANT
-- ============================================================

INSERT INTO documents (part_id, title, doc_type, content) VALUES

-- JOINT 1 - BASE
(1, 'Installation et fixation de la base', 'text',
'INSTALLATION BASE UR5e - JOINT 1

SUPPORT DE FIXATION :
- Plaque acier ou aluminium, epaisseur >= 10 mm
- Deflexion max admissible : 0.3 mm sous charge complete
- 4 alesages M6 sur PCD diam. 63 mm, tolerances +/- 0.1 mm
- Surface d appui plane a +/- 0.5 mm

MONTAGE :
1. Positionner le robot sur le support propre et sec
2. Inserer les 4 vis M6 classe 8.8
3. Serrer en croix au couple : 9 Nm (sol/mur) ou 12 Nm (plafond)
4. Verifier le serrage apres la 1ere journee de travail
5. Controler le serrage tous les 3 mois en maintenance

CONNEXIONS ELECTRIQUES :
- Cable bras vers boitier : connecteur M12 12 broches, longueur 6 metres
- Rayon courbure min au repos : R = 75 mm
- Rayon courbure min en mouvement : R = 125 mm
- Ne jamais pincer le cable sous le bras

INDICATEUR LED BASE (anneau couleur) :
- Bleu fixe : initialisation / demarrage en cours
- Vert fixe : pret, fonctionnement normal
- Vert clignotant : programme en cours d execution
- Orange fixe : avertissement actif (payload, temperature...)
- Rouge fixe : erreur systeme
- Rouge clignotant : E-Stop engage ou erreur securite'),

(1, 'Specifications mecaniques UR5e', 'text',
'SPECIFICATIONS MECANIQUES - UR5e

DIMENSIONS GENERALES :
- Portee max horizontale (TCP) : 850 mm
- Portee max verticale : 1193 mm (bras tendu vers le haut)
- Hauteur a la configuration zero : ~1000 mm
- Empreinte base : diam. 149 mm

POIDS :
- Masse du bras (cable 6m inclus) : 20.6 kg
- Centre de gravite approx. : 119 mm au-dessus de la base

PERFORMANCES :
- Charge utile maximale : 5 kg (outil + piece)
- Repetabilite : +/- 0.03 mm (ISO 9283)
- Vitesse TCP programmable max : 4 m/s
- Acceleration TCP max : 12 m/s²

MATERIAUX :
- Corps : aluminium 6061-T6 anodise dur
- Couvercles : polycarbonate renforce fibre de verre
- Fixations : acier inoxydable A2-70

ENVIRONNEMENT :
- Temperature de fonctionnement : 0 a 50 degC
- Humidite relative : <= 90% HR non condensant
- Protection : IP54 (projections eau omnidirectionnelles)
- Salle blanche : ISO 4 a <= 20% vitesse/charge
- Niveau sonore : < 65 dB(A)'),

-- JOINT 2 - SHOULDER
(2, 'Maintenance Joint 2 - Shoulder', 'text',
'MAINTENANCE EPAULE - JOINT 2 (SHOULDER)

INSPECTION MENSUELLE :
- Verifier absence de jeu mecanique (robot eteint, freins engages)
- Inspecter les cables a la jonction base/epaule
- Nettoyer connecteurs avec air comprime sec (< 2 bar)
- Verifier absence de fuite de graisse sur joint

INSPECTION TRIMESTRIELLE :
- Test de freinage : passer en FreeDrive, relacher bouton, verifier maintien position
- Controler temperature en service (max 70 degC)
- Verifier serrage des vis de carter

REDUCTEUR HARMONIQUE :
- Lubrifie a vie en usine (Harmonic Drive)
- Ne JAMAIS ouvrir le carter du joint
- Toute fuite de graisse = contacter SAV Universal Robots
- Duree de vie nominale : 35 000 heures

CODES D ERREUR JOINT 2 :
C105A2 : Surcouple Shoulder - verifier payload et trajectoire
C131A2 : Perte communication J2 - inspecter cable bras
C207A0 : Arret protection - obstacle ou limite depassee

PROCEDURE REINITIALISATION :
1. Appuyer E-Stop, identifier la cause
2. Journal PolyScope > Effacer erreurs
3. Relacher E-Stop, appuyer ON puis DEMARRER
4. Lancer l initialisation des joints'),

-- UPPER ARM SEGMENT
(3, 'Cinematique et espace de travail', 'text',
'CINEMATIQUE - BRAS SUPERIEUR (SEGMENT J2-J3)

GEOMETRIE DU BRAS UR5e :
- Segment Upper Arm (J2 vers J3) : 425 mm
- Segment Forearm (J3 vers J5) : 392.2 mm
- Distance J5 vers TCP standard : 82 mm
- Portee max TCP : 850 mm depuis axe J1

PERFORMANCES TRAJECTOIRES :
- Repetabilite : +/- 0.03 mm (ISO 9283)
- Vitesse TCP max programmable : 4 m/s
- Vitesse TCP typique applicatif : 1 m/s
- Acceleration TCP max : 12 m/s2
- Jerk max : 8000 deg/s3 (sur les joints)

TYPES DE MOUVEMENTS :
- MoveJ : interpolation joints (transitions rapides, trajectoire non lineaire)
- MoveL : interpolation lineaire cartesienne (approche precise, soudage)
- MoveP : spline continu (soudage, enduction, decoupe)
- MoveC : arc circulaire (contournage, polissage)

CONFIGURATION ZERO DEGRE :
- Tous joints a 0 deg = bras entierement vertical
- J1 et J3 alignes sur l axe de la base
- TCP pointe directement vers le haut

ZONE DE TRAVAIL :
- Zone optimale precision : rayon 300 a 700 mm
- Eviter la position singuliere (bras completement tendu)
- Eviter bras completement replie (singularite poignet)'),

-- JOINT 3 - ELBOW
(4, 'Securite et fonctions PLd Cat.3 - Coude', 'text',
'SECURITE COUDE (ELBOW) - JOINT 3
17 FONCTIONS DE SECURITE PLd Cat.3

FONCTIONS SPECIFIQUES AU COUDE (parmi les 17) :
12. Elbow Speed Limit : limite la vitesse du point coude
13. Elbow Force Limit : limite la force generee au coude
    - Seuil configurable : 10 a 250 N
    - Reaction : arret immediat + retraction optionnelle
    - Conforme ISO/TS 15066 (cobot collaboratif)

AUTRES FONCTIONS SECURITE (selection) :
1. Arret urgence (E-Stop) : Cat.0, PLd
2. Arret protection (Safeguard Stop)
3. Vitesse TCP max
4. Force TCP max
5. Puissance max
6. Momentum max
7-11. Plans de securite (6 plans virtuels configurables)
14-17. Vitesse/Force joints individuels

CATEGORIES D ARRET :
- Cat. 0 : coupure immediate + freins mecaniques (<0.5s)
- Cat. 1 : deceleration controlee puis coupure
- Cat. 2 : arret controle, motorisation maintenue

FREEDRIVE (guidage manuel) :
- Mode Manuel T-Speed uniquement (<= 250 mm/s)
- Bouton FreeDrive sur Teach Pendant (maintien)
- Bras guidable a la main librement
- Utile : teach-in, demonstration, contournement obstacles'),

-- FOREARM SEGMENT
(5, 'Entretien et lubrification avant-bras', 'text',
'ENTRETIEN AVANT-BRAS (SEGMENT J3-J5)

INSPECTION PERIODIQUE :
- Mensuel : inspection visuelle corps aluminium (chocs, fissures)
- Mensuel : verifier gaine cable interne (pas de pince)
- Trimestriel : verifier jeu dans les joints J4 et J5
- Annuel : inspecter joints O-ring etancheite

CONNECTIQUE INTERNE :
- Cables joints J4, J5, J6 passent dans le corps creux
- Rayon courbure interne respect automatiquement par design
- Ne pas ouvrir le corps de l avant-bras

VERIFICATION PORTEE :
  get_actual_tcp_pose()       # position TCP temps reel
  get_joint_temperatures()    # temperature joints
  get_actual_joint_speeds()   # vitesses actuelles
  get_joint_torques()         # couples actuels

SIGNES PROBLEMES :
- Vibrations a vitesse elevee : verifier fixation J3
- Bruit de frottement : cable interne a inspecter
- Ecart position > 0.1 mm : recalibration TCP necessaire

RECALIBRATION TCP :
1. Methode 4 points : pointer meme point 4 orientations
2. PolyScope : Installation > TCP > Methode automatique
3. Valider et sauvegarder l installation'),

-- JOINT 4 - WRIST 1
(6, 'Entretien et remplacement Wrist 1 - ref 124100', 'text',
'ENTRETIEN POIGNET 1 - JOINT 4 (WRIST 1)
REFERENCE PIECE DE RECHANGE : 124100

CARACTERISTIQUES :
- Taille : Size 0 (plus compact que les joints Size 1)
- Moteur : BLDC brushless
- Reducteur : Harmonique Drive (zero backlash)
- Frein : ressort fail-safe (engage si alim. coupee)
- Duree vie nominale : 35 000 heures

INSPECTION MENSUELLE :
- Controle visuel : absence de dommages physiques
- Ecoute : absence de bruit anormal (grincement, claquement)
- Nettoyer soigneusement (chiffon non pelucheux)

INSPECTION TRIMESTRIELLE :
- Test freinage : FreeDrive, relacher, verifier maintien position
- Serrage vis de carter poignet (M4, 3 Nm)

INSPECTION ANNUELLE :
- Joints O-ring : inspecter, remplacer si deteriores (ref 131095)
- Connecteurs internes : verifier absence oxydation

SIGNES D USURE :
- Grincement : usure du reducteur harmonique
- Jeu mecanique > 0.1 mm : reducteur a remplacer
- Vibrations anormales : desalignement ou choc subi
- Erreur C105A4 recurrente : capteur couple a verifier

REMPLACEMENT :
- Intervention SAV Universal Robots obligatoire
- Ref commande Wrist 1 : 124100
- Prevoir : kit joints O-ring 131095, lubrifiant Harmonic Drive'),

(6, 'Codes erreur Wrist 1 Joint 4', 'text',
'CODES ERREUR - JOINT 4 (WRIST 1)

C105A4 - Surcouple Wrist 1
  Cause : surcharge outil, collision, payload mal configure
  Action : verifier masse outil + CDG, reinitialiser

C131A4 - Perte communication Joint 4
  Cause : cable interne sectionne, connecteur desserre
  Action : inspecter connectique interne avant-bras

C108A4 - Temperature elevee Joint 4
  Cause : charge trop importante, ventilation insuffisante
  Action : reduire vitesse, verifier ventilation, attendre refroidissement

C135A4 - Erreur encodeur Joint 4
  Cause : choc violent, encodeur endommage
  Action : intervention SAV obligatoire

PROCEDURE REINITIALISATION STANDARD :
1. Appuyer E-Stop (Teach Pendant ou boitier)
2. Identifier et corriger la cause (degager, reduire charge...)
3. PolyScope > Journal > Effacer les erreurs
4. Relacher E-Stop (tourner pour deverrouiller)
5. Appuyer ON puis DEMARRER
6. Verifier position du robot avant relance programme'),

-- JOINT 5 - WRIST 2
(7, 'Entretien Wrist 2 - ref 124101', 'text',
'ENTRETIEN POIGNET 2 - JOINT 5 (WRIST 2)
REFERENCE PIECE DE RECHANGE : 124101

SPECIFICITES :
- Taille Size 0 (identique a Wrist 1 et Wrist 3)
- Coordonne en permanence avec J4 (Wrist 1) et J6 (Wrist 3)
- Ces 3 joints donnent l orientation complete de l outil (3 DDL)
- Couple nominal : 8.4 Nm

MAINTENANCE PREVENTIVE :
- Mensuel : inspection visuelle et nettoyage
- Trimestriel : test de freinage + serrage vis
- 5 ans : inspection joints O-ring (ref 131095)
- 35 000 h : remplacement Wrist 1 (124100) + Wrist 2 (124101) + Wrist 3 (102414)
  -> Les 3 Wrists sont generalement remplaces ensemble

COMMANDES DIAGNOSTIC URSCRIPT :
  get_joint_temperatures()   # temperature en degC de chaque joint [0..5]
  get_actual_joint_speeds()  # vitesses en rad/s
  get_joint_torques()        # couples mesures en Nm
  get_actual_joint_positions() # positions angulaires en rad

NOTA BENE :
- En cas de choc violent sur le poignet, inspecter les 3 Wrists
- Un choc peut endommager l encodeur sans trace visible externe
- Toujours tester la repetabilite apres un incident'),

-- JOINT 6 - WRIST 3 + TOOL FLANGE
(8, 'Raccordement electrique bride outil - M8 8 broches', 'text',
'RACCORDEMENT ELECTRIQUE BRIDE OUTIL
CONNECTEUR M8 8 BROCHES FEMELLE

BROCHAGE :
  Broche 1 : GND (masse commune)
  Broche 2 : 12V DC (1.5A max, commutable 24V)
  Broche 3 : 12V DC (1.5A max, commutable 24V)
  Broche 4 : Entree numerique 0 (0-24V, NPN ou PNP configurable)
  Broche 5 : Entree numerique 1 (0-24V, NPN ou PNP configurable)
  Broche 6 : Sortie numerique 0 (24V, 1A max)
  Broche 7 : Sortie numerique 1 (24V, 1A max)
  Broche 8 : Entree analogique 0 (0-10V / 4-20mA) ou RS-485 A

CONFIGURATION DANS POLYSCOPE :
  Installation > E/S > Configuration outil
  - Tension : choisir 12V ou 24V
  - Type E/S : NPN ou PNP selon outil
  - RS-485 : activer si communication serie necessaire

CAPTEUR FORCE/COUPLE 6 AXES (F/T) :
  - Mesure : Fx, Fy, Fz, Tx, Ty, Tz
  - Plage force : +/- 50.0 N (precision +/- 3.5 N)
  - Plage couple : +/- 10.0 N.m (precision +/- 0.2 N.m)
  - Frequence : 125 Hz (RTDE) ou 500 Hz interne
  - Acces URScript : get_tcp_force() -> [Fx, Fy, Fz, Tx, Ty, Tz]

OUTILS COMPATIBLES UR+ (selection) :
  - Robotiq 2F-85 / 2F-140 : pince parallele standard
  - OnRobot RG2 / RG6 : pince adaptative
  - Robotiq Hand-E : precision haute
  - Schunk EGP : pince electrique compacte'),

(8, 'Montage outil ISO 9409-1-50-4-M6', 'text',
'MONTAGE OUTIL - BRIDE ISO 9409-1-50-4-M6

SIGNIFICATION DU CODE NORME :
  9409  = norme ISO fixations outils robots
  1     = serie 1 (type flasque)
  50    = diametre de centrage 50 mm
  4     = 4 trous de fixation
  M6    = filetage M6

DIMENSIONS BRIDE UR5e :
  - Centrage : 50f7 mm (tolerances fines -0.025/-0.050)
  - Cercle primitif des vis : 63 mm de diametre
  - Trous de fixation : 4x M6, profondeur 10 mm
  - Goupille detrompeur : 6H7 x 8 mm (assure orientation)
  - Couple de serrage vis outil : 6 Nm (vis M6 classe 8.8)

PROCEDURE MONTAGE OUTIL :
  1. Couper alimentation robot (E-Stop)
  2. Nettoyer surfaces de contact (degraissant isopropanol)
  3. Aligner goupille detrompeur avec logement outil
  4. Poser outil sur bride, engager goupille
  5. Visser les 4 vis M6 en etoile
  6. Serrer progressivement : 2 Nm, puis 6 Nm
  7. Connecter cable M8 8 broches (cle 8)
  8. PolyScope > Installation > Payload : configurer masse + CDG
  9. PolyScope > Installation > TCP : mesurer le TCP
  10. Sauvegarder l installation, tester en mode manuel

ATTENTION :
  - Ne jamais depasser 5 kg (masse outil + masse piece)
  - Un payload mal configure = erreurs trajectoire + collision
  - Le TCP doit etre remesure si l outil est change'),

-- CONTROL BOX
(9, 'Raccordement electrique boitier de commande', 'text',
'RACCORDEMENT ELECTRIQUE - BOITIER CB-2 UR5e

ALIMENTATION SECTEUR (IEC 320 C13) :
  - Tension : 100-240 VAC auto-switching
  - Frequence : 47 a 440 Hz
  - Puissance typique : 200 W | Puissance max : 570 W
  - Fusible integre : 10A, 250V

E/S NUMERIQUES (connecteur gris, 16 IN + 16 OUT) :
  - Entrees : 24V DC, 11 mA par entree, impedance 2.2 kOhm
  - Sorties : 24V DC, 2A total, 0.5A par sortie max
  - Frequence max : 1 kHz standard, 40 kHz en mode quadrature

E/S ANALOGIQUES (2 IN + 2 OUT) :
  - Plage : 0-10V DC ou 4-20mA (commutable)
  - Resolution : 12 bits (4096 pas)

E/S SECURITE (connecteur vert) :
  - E-Stop robot IN/OUT (2 contacts NC)
  - Safeguard Stop IN / Reset
  - Mode operationnel (Manuel / Automatique)
  - Mode reduit vitesse
  - Validateur 3 positions

RESEAU ETHERNET :
  - Interface : 1 Gb/s, connecteur RJ45
  - IP defaut : 192.168.56.101
  - Masque reseau defaut : 255.255.255.0
  - DHCP disponible (activer dans PolyScope Installation > Reseau)'),

(9, 'Protocoles de communication industriels', 'text',
'PROTOCOLES COMMUNICATION - BOITIER UR5e

MODBUS TCP :
  Mode : Client ET Serveur simultanes | Port : 502
  Registres : 0-511 (E/S + positions + statut)
  PolyScope : Installation > Fieldbus > Modbus

ETHERNET/IP :
  Mode : Adapter (esclave)
  Acces : E/S, positions joints, vitesses, couples
  PolyScope : Installation > Fieldbus > EtherNet/IP

PROFINET / PROFISAFE :
  Mode : Device (esclave IO)
  ProfiSafe supporte (PLd, SIL2)
  Fichier GSDML a telecharger sur my.universal-robots.com

ROS / ROS2 :
  Driver : ur_robot_driver (open-source GitHub)
  Interface RTDE sur port 30004 a 500 Hz
  Topics : joint_states, robot_status, tool_contact, E/S

PORTS URSCRIPT (TCP) :
  30001 : Mode primaire (1 message/s, statut robot)
  30002 : Mode secondaire (125 Hz)
  30003 : Mode temps reel (125 Hz, commandes directes)
  30004 : RTDE (500 Hz, bidirectionnel, structure definie)
  29999 : Dashboard Server (commandes texte telnet)

DASHBOARD SERVER (telnet 192.168.56.101 29999) :
  > power on          # mettre sous tension
  > brake release     # desengager freins
  > load /prog.urp    # charger programme
  > play | stop | pause
  > get robot model   # "UR5e"
  > robotmode         # statut actuel'),

-- TEACH PENDANT
(10, 'Guide PolyScope - Teach Pendant TP5', 'text',
'GUIDE POLYSCOPE X - TEACH PENDANT TP5 e-SERIES

5 ONGLETS PRINCIPAUX :

1. MOVE (Deplacement) :
   - Controle manuel joint par joint (J1 a J6)
   - Controle cartesien TCP (X, Y, Z, Rx, Ry, Rz)
   - Reglage vitesse 1% a 100% (curseur)
   - Modes repere : Joint, TCP, Outil, Base, Fonctionnalite

2. PROGRAM (Programme) :
   - Programmation graphique par blocs drag & drop
   - Noeuds : MoveJ, MoveL, MoveP, MoveC, Wait, If/Else, Loop
   - Noeuds Script : URScript inline
   - Appel de sous-programmes
   - Simulation offline

3. INSTALLATION :
   - TCP (position + orientation outil)
   - Payload (masse + centre de gravite)
   - Montage robot (orientation base)
   - Plans et zones de securite
   - Configuration E/S et protocoles fieldbus

4. RUN (Execution) :
   - Lancer / Pause / Stop programme
   - Mode Pas a Pas pour debug
   - Visualisation 3D temps reel du robot

5. LOG (Journal) :
   - Historique erreurs et avertissements horodates
   - Codes erreur avec description et suggestion
   - Export logs sur USB pour diagnostic SAV

MODES OPERATOIRES :
  AUTO : vitesse complete, mode production
  MANUEL T-Speed : vitesse <= 250 mm/s, FreeDrive actif
  TELECOMMANDE : pilotage par PLC externe via E/S'),

(10, 'Procedure premiere mise en service', 'text',
'PREMIERE MISE EN SERVICE UR5e

ETAPE 1 - PREPARATION MECANIQUE :
  1. Fixer la base : 4 vis M6 a 9 Nm (sol/mur) ou 12 Nm (plafond)
  2. Verifier planite support (<= 0.5 mm)
  3. Connecter cable bras > boitier (M12, 6 metres)
  4. Connecter Teach Pendant au boitier (prise dedee)
  5. Connecter cable Ethernet RJ45 (optionnel)
  6. Connecter alimentation secteur IEC C13

ETAPE 2 - PREMIER DEMARRAGE :
  1. Interrupteur principal boitier sur ON
  2. Attendre demarrage PolyScope (~45 secondes)
  3. Ecran Teach Pendant allume : accepter le CLUF
  4. PolyScope pret

ETAPE 3 - INITIALISATION DU BRAS :
  1. Ecran PolyScope : appuyer sur le bouton ON
  2. Relacher l E-Stop physique (tourner pour deverrouiller)
  3. Appuyer sur DEMARRER
  4. Bruit caracteristique : freins qui se desengagent
  5. Initialisation joints terminee

ETAPE 4 - CONFIGURATION DE BASE :
  1. Installation > Montage : choisir l orientation (sol, plafond, mur...)
  2. Installation > TCP : configurer le point central de l outil
  3. Installation > Payload : saisir masse (kg) + CDG (X, Y, Z)
  4. Sauvegarder l installation (important !)

ETAPE 5 - TESTS FONCTIONNELS :
  1. Mode Manuel : tester chaque joint J1 a J6 individuellement
  2. Verifier absence de bruit anormal a chaque articulation
  3. Test FreeDrive : maintenir bouton, guider manuellement le bras
  4. Test E-Stop : appuyer, verifier arret immediat, relancer

SECURITE :
  - Ne jamais programmer en mode Auto sans protections
  - Teach Pendant accessible a tout moment pendant le travail
  - E-Stop a portee de main permanente operateur');


-- ============================================================
-- FAQ INITIALE (12 questions couvrant tous les composants)
-- ============================================================

INSERT INTO faq (question, answer, part_id) VALUES

('Quelle est la charge utile maximale du UR5e ?',
'La charge utile maximale du UR5e est de 5 kg. Cette valeur inclut la masse de l outil ET la piece transportee. Il est essentiel de configurer correctement le payload dans PolyScope (Installation > Payload : masse + centre de gravite) pour garantir la repetabilite a +/-0.03mm et eviter les erreurs de couple sur les joints.',
NULL),

('Comment reinitialiser une erreur sur le UR5e ?',
'1. Identifier le code erreur dans PolyScope (Onglet Journal)\n2. Corriger la cause (degager obstacle, reduire charge...)\n3. Journal > Effacer les erreurs\n4. Appuyer sur E-Stop\n5. Relacher l E-Stop (tourner pour deverrouiller)\n6. PolyScope : ON puis DEMARRER\nSi l erreur persiste apres 3 tentatives : contacter le support Universal Robots.',
NULL),

('Quelle est la portee maximale du UR5e ?',
'La portee maximale est de 850 mm. C est le rayon de la sphere de travail centree sur l axe J1 (base). La zone optimale pour la precision (+/-0.03mm) se situe entre 300mm et 700mm du centre de la base. Eviter de travailler au maximum de la portee (risque singularite, performance reduite).',
NULL),

('Comment utiliser le FreeDrive pour programmer le robot ?',
'1. Passer en mode Manuel sur le Teach Pendant (cle ou menu)\n2. Maintenir le bouton FreeDrive enfonce (face avant du TP)\n3. Le bras devient souple et guidable a la main librement\n4. Positionner le bras a la position souhaitee\n5. Relacher le bouton pour bloquer en position\n6. Dans PolyScope : ajouter un waypoint (MoveJ ou MoveL)\nLimite : vitesse limitee a 250 mm/s en mode Manuel.',
NULL),

('Quels sont les intervalles de maintenance du UR5e ?',
'- Mensuel : inspection visuelle cables, connecteurs, fixations\n- Trimestriel : verifier couple base (9 Nm sol), tester E-Stop et securites\n- Semestriel : verifier version PolyScope, sauvegarder programmes\n- Annuel : inspection joints O-ring (ref 131095)\n- 5 ans : remplacer batterie CMOS CR2032 boitier (ref 170009)\n- 35 000h : remplacer Wrist 1 (ref 124100) + Wrist 2 (ref 124101) + Wrist 3 (ref 102414)',
NULL),

('Que faire en cas d arret d urgence ?',
'1. L E-Stop (bouton rouge) coupe immediatement la motorisation\n2. Identifier et corriger la cause du declenchement\n3. Relacher l E-Stop : tourner dans le sens de la fleche\n4. PolyScope : effacer l erreur C119A3\n5. Appuyer ON puis DEMARRER\n6. Verifier la position du robot avant de relancer le programme\nSi E-Stop intempestif frequent : verifier le cablage du circuit securite.',
NULL),

('Comment configurer le TCP (Tool Center Point) ?',
'1. Fixer l outil sur la bride ISO 9409-1-50-4-M6\n2. PolyScope : Installation > TCP\n3. Methode manuelle : mesurer et saisir X, Y, Z, Rx, Ry, Rz\n4. Methode automatique 4 points : pointer le meme point fixe depuis 4 orientations differentes\n5. Configurer le payload : masse (kg) + centre de gravite (X, Y, Z)\n6. Sauvegarder l installation\nUn TCP mal configure entraine des erreurs de trajectoire et risque de collision.',
6),

('Quelle est la difference entre Joint Size 1 et Size 0 ?',
'Le UR5e utilise deux tailles de joints :\n- Size 1 (grand) : Joint 1 (Base), Joint 2 (Shoulder), Joint 3 (Elbow). Ces joints portent les charges les plus importantes, couple nominal ~56 Nm.\n- Size 0 (petit) : Joint 4 (Wrist 1, ref 124100), Joint 5 (Wrist 2, ref 124101), Joint 6 (Wrist 3, ref 102414). Ces joints plus compacts permettent l orientation fine de l outil, couple nominal ~8.4 Nm.\nLes 3 Wrists (Size 0) ont la meme duree de vie (35 000h) et sont generalement remplaces ensemble.',
NULL),

('Comment utiliser le capteur Force/Couple de la bride outil ?',
'Le UR5e integre un capteur F/T 6 axes directement dans la bride (Joint 6) :\n- Plage force : +/- 50 N (precision +/- 3.5 N)\n- Plage couple : +/- 10 N.m (precision +/- 0.2 N.m)\n- Acces URScript : get_tcp_force() retourne [Fx, Fy, Fz, Tx, Ty, Tz]\nUtilisations typiques :\n- Assemblage force-guidee (vissage, emboitement)\n- Polissage et meulage (force constante)\n- Detection contact piece\n- Controle serrage',
8),

('Comment connecter le UR5e en PROFINET ?',
'1. PolyScope : Installation > Fieldbus > PROFINET\n2. Activer PROFINET Device\n3. Configurer le nom de l appareil (ex: "ur5e-robot")\n4. Telecharger le fichier GSDML sur my.universal-robots.com\n5. TIA Portal (Siemens) : importer GSDML, ajouter UR5e dans topologie reseau\n6. Configurer les modules E/S (16 DI, 16 DO, 2 AI, 2 AO)\n7. Connecter le cable Ethernet RJ45 au boitier\nProtocole ProfiSafe egalement supporte (PLd, SIL2) pour fonctions securite via PROFINET.',
9),

('Comment remplacer la batterie du boitier de commande ?',
'Batterie CR2032 (reference 170009), intervalle recommande : 5 ans\n1. Couper alimentation secteur du boitier\n2. Attendre 5 minutes (condensateurs)\n3. Ouvrir le panneau lateral (4 vis cruciformes)\n4. Localiser la Control Board (carte principale)\n5. Reperer la pile CR2032 (support a pince)\n6. Extraire ancienne pile avec outil plastique (ne pas utiliser metal)\n7. Inserer nouvelle CR2032 3V lithium, polarite + vers le haut\n8. Refermer le boitier\n9. Remettre sous tension, verifier l heure systeme dans PolyScope\nAttention : la pile maintient l heure RTC et la configuration reseau.',
9),

('Quelle est la signification du code erreur C207A0 ?',
'C207A0 = Arret de protection (Safeguard Stop)\nUn dispositif de protection externe a ete declenche.\nCauses possibles :\n- Barriere immateriellement coupee\n- Tapis sensible presse\n- Porte de cellule de securite ouverte\n- Signal Safeguard Stop actif sur E/S boitier (connecteur vert)\nAction :\n1. Identifier le dispositif declenche (inspecter la cellule)\n2. Corriger la situation (fermer porte, degager zone protegee...)\n3. Reinitialiser le dispositif de protection\n4. PolyScope : effacer l erreur\n5. Relancer le programme\nSi recurrent sans cause evidente : verifier le cablage E/S securite.',
NULL);
