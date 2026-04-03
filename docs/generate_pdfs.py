"""
generate_pdfs.py
Generates 10 professional maintenance PDF files for the MARA robot app (UR5e).
Uses reportlab Platypus for layout.
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.platypus.flowables import Flowable

# ---------------------------------------------------------------------------
# Colour palette
# ---------------------------------------------------------------------------
COL_HEADER_BG   = colors.Color(10/255,  10/255,  10/255)   # #0a0a0a
COL_WHITE       = colors.white
COL_BLUE        = colors.Color(29/255,  78/255, 216/255)    # #1d4ed8
COL_TABLE_HDR   = colors.Color(243/255,244/255,246/255)     # #f3f4f6
COL_TABLE_ALT   = colors.Color(249/255,250/255,251/255)     # very light grey
COL_BODY_BG     = colors.white
COL_FOOTER_LINE = colors.Color(180/255,180/255,180/255)
COL_PART_ID_BG  = colors.Color(29/255, 78/255, 216/255)    # same blue as titles

# ---------------------------------------------------------------------------
# Page dimensions
# ---------------------------------------------------------------------------
PAGE_W, PAGE_H = A4          # 595.28 x 841.89 points
MARGIN_LEFT    = 18 * mm
MARGIN_RIGHT   = 18 * mm
MARGIN_TOP     = 8 * mm      # small — header drawn manually
MARGIN_BOTTOM  = 18 * mm
CONTENT_W      = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT

# ---------------------------------------------------------------------------
# Custom header flowable
# ---------------------------------------------------------------------------
class PageHeader(Flowable):
    """Full-width black header with subtitle line and part name."""

    def __init__(self, part_name, part_id, category, ref=None):
        super().__init__()
        self.part_name = part_name
        self.part_id   = part_id
        self.category  = category
        self.ref       = ref
        self.width     = CONTENT_W
        self.height    = 52 * mm

    def draw(self):
        c = self.canv
        w, h = self.width, self.height

        # Background rectangle
        c.setFillColor(COL_HEADER_BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)

        # ---- Top bar: left label / right label ----
        c.setFillColor(COL_WHITE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(6 * mm, h - 10 * mm, "MARA \u2014 Maintenance AR")
        c.drawRightString(w - 6 * mm, h - 10 * mm, "Universal Robots UR5e")

        # Thin separator line
        c.setStrokeColor(colors.Color(60/255, 60/255, 60/255))
        c.setLineWidth(0.5)
        c.line(6 * mm, h - 13 * mm, w - 6 * mm, h - 13 * mm)

        # ---- Part name (large title) ----
        c.setFillColor(COL_WHITE)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(6 * mm, h - 30 * mm, self.part_name)

        # ---- Part ID chip ----
        chip_x  = 6 * mm
        chip_y  = h - 43 * mm
        chip_w  = 28 * mm
        chip_h  = 7 * mm
        c.setFillColor(COL_BLUE)
        c.roundRect(chip_x, chip_y, chip_w, chip_h, 2, fill=1, stroke=0)
        c.setFillColor(COL_WHITE)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(chip_x + chip_w / 2, chip_y + 2.0 * mm,
                            "ID #{}".format(self.part_id))

        # ---- Category chip ----
        cat_x = chip_x + chip_w + 3 * mm
        c.setFillColor(colors.Color(40/255, 40/255, 40/255))
        c.roundRect(cat_x, chip_y, 40 * mm, chip_h, 2, fill=1, stroke=0)
        c.setFillColor(colors.Color(180/255, 180/255, 180/255))
        c.setFont("Helvetica", 8)
        c.drawString(cat_x + 3 * mm, chip_y + 2.0 * mm, self.category)

        # ---- Reference chip (optional) ----
        if self.ref:
            ref_x = cat_x + 40 * mm + 3 * mm
            c.setFillColor(colors.Color(40/255, 40/255, 40/255))
            c.roundRect(ref_x, chip_y, 38 * mm, chip_h, 2, fill=1, stroke=0)
            c.setFillColor(colors.Color(180/255, 180/255, 180/255))
            c.setFont("Helvetica", 8)
            c.drawString(ref_x + 3 * mm, chip_y + 2.0 * mm,
                         "Ref: {}".format(self.ref))


# ---------------------------------------------------------------------------
# Custom footer via canvas callback
# ---------------------------------------------------------------------------
def make_footer_callback(part_id):
    def footer(canvas, doc):
        canvas.saveState()
        x0 = MARGIN_LEFT
        x1 = PAGE_W - MARGIN_RIGHT
        y  = MARGIN_BOTTOM - 8 * mm

        canvas.setStrokeColor(COL_FOOTER_LINE)
        canvas.setLineWidth(0.5)
        canvas.line(x0, y + 5 * mm, x1, y + 5 * mm)

        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.Color(120/255, 120/255, 120/255))
        canvas.drawCentredString(PAGE_W / 2, y + 2 * mm,
                                 "MARA SAE402 \u2014 IUT MMI Beziers")
        canvas.drawRightString(x1, y + 2 * mm,
                               "Part ID #{}  \u2014  Page {}".format(
                                   part_id, canvas.getPageNumber()))
        canvas.restoreState()
    return footer


# ---------------------------------------------------------------------------
# Style helpers
# ---------------------------------------------------------------------------
def make_styles():
    base = getSampleStyleSheet()

    section_title = ParagraphStyle(
        "SectionTitle",
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=COL_BLUE,
        spaceBefore=6,
        spaceAfter=3,
        leading=14,
    )
    body_text = ParagraphStyle(
        "BodyText2",
        fontName="Helvetica",
        fontSize=9,
        textColor=colors.Color(30/255, 30/255, 30/255),
        spaceBefore=2,
        spaceAfter=4,
        leading=13,
        alignment=TA_JUSTIFY,
    )
    specs_title = ParagraphStyle(
        "SpecsTitle",
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=COL_BLUE,
        spaceBefore=8,
        spaceAfter=4,
        leading=13,
    )
    return section_title, body_text, specs_title


# ---------------------------------------------------------------------------
# Build specs table
# ---------------------------------------------------------------------------
def build_specs_table(specs):
    """specs: list of (label, value) tuples."""
    col_w = [CONTENT_W * 0.38, CONTENT_W * 0.62]

    header_row = [
        Paragraph("<b>Parametre</b>",
                  ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8.5,
                                 textColor=colors.Color(50/255,50/255,50/255))),
        Paragraph("<b>Valeur</b>",
                  ParagraphStyle("th", fontName="Helvetica-Bold", fontSize=8.5,
                                 textColor=colors.Color(50/255,50/255,50/255))),
    ]
    cell_style = ParagraphStyle(
        "tc", fontName="Helvetica", fontSize=8.5,
        textColor=colors.Color(30/255,30/255,30/255), leading=11
    )
    cell_style_bold = ParagraphStyle(
        "tcb", fontName="Helvetica", fontSize=8.5,
        textColor=colors.Color(60/255,60/255,60/255), leading=11
    )

    data = [header_row]
    for lbl, val in specs:
        data.append([
            Paragraph(lbl, cell_style_bold),
            Paragraph(str(val), cell_style),
        ])

    # Row colours: alternating
    row_bgs = []
    for i in range(1, len(data)):
        bg = COL_WHITE if i % 2 == 1 else COL_TABLE_ALT
        row_bgs.append(("BACKGROUND", (0, i), (1, i), bg))

    style = TableStyle([
        # Header row
        ("BACKGROUND",   (0, 0), (1, 0), COL_TABLE_HDR),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("GRID",         (0, 0), (-1, -1), 0.4,
         colors.Color(210/255, 210/255, 210/255)),
    ] + row_bgs)

    tbl = Table(data, colWidths=col_w, repeatRows=1)
    tbl.setStyle(style)
    return tbl


# ---------------------------------------------------------------------------
# Core function: build one PDF
# ---------------------------------------------------------------------------
def build_pdf(filepath, part_name, part_id, category, specs,
              sections, ref=None):
    """
    sections: list of (title, body_text) tuples (4 sections expected).
    """
    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM + 6 * mm,
        title="MARA - {}".format(part_name),
        author="MARA SAE402 - IUT MMI Beziers",
    )

    section_title_style, body_style, specs_title_style = make_styles()

    story = []

    # --- Header ---
    story.append(PageHeader(part_name, part_id, category, ref))
    story.append(Spacer(1, 5 * mm))

    # --- Specs section ---
    story.append(Paragraph("Specifications Techniques", specs_title_style))
    story.append(build_specs_table(specs))
    story.append(Spacer(1, 5 * mm))

    # Divider
    story.append(HRFlowable(width="100%", thickness=0.5,
                             color=colors.Color(200/255,200/255,200/255),
                             spaceAfter=4))

    # --- Content sections ---
    for sec_title, sec_body in sections:
        block = [
            Paragraph(sec_title, section_title_style),
            Paragraph(sec_body, body_style),
            Spacer(1, 3 * mm),
        ]
        story.append(KeepTogether(block))

    # Build with footer callback
    footer_cb = make_footer_callback(part_id)

    def on_page(canvas, doc):
        footer_cb(canvas, doc)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print("  [OK] {}".format(os.path.basename(filepath)))


# ===========================================================================
# DATA for all 10 parts
# ===========================================================================

PARTS = []

# ---- 1. Base (Joint 1) ----
PARTS.append(dict(
    filename="fiche_base_joint1.pdf",
    part_name="Base (Joint 1)",
    part_id=1,
    category="Installation",
    ref=None,
    specs=[
        ("Designation",          "Joint 1 - Base"),
        ("Taille joint",         "Size 1 (grand)"),
        ("Plage mouvement",      "+/- 360 deg"),
        ("Vitesse max",          "180 deg/s"),
        ("Empreinte",            "O 149 mm"),
        ("Fixation",             "4 vis M6 sur PCD O 63 mm"),
        ("Couple serrage sol/mur","9 N.m"),
        ("Couple serrage plafond","12 N.m"),
        ("Montage",              "Toute orientation"),
        ("Protection IP",        "IP54"),
        ("Indicateur LED",       "Anneau couleur"),
        ("Materiau",             "Aluminium, plastique, acier"),
    ],
    sections=[
        (
            "1. Principe de Fonctionnement & Architecture",
            "La Base (Joint 1) est l'articulation de Taille 1 (Size 1) qui supporte l'integralite de la "
            "cinematique du robot. Elle permet une rotation axiale complete de +/-360 deg a une vitesse "
            "maximale de 180 deg/s. C'est le point d'ancrage principal du cobot, assurant la liaison "
            "mecanique et electrique (via un cable de 6 metres) avec le boitier de commande. Elle integre "
            "un anneau LED indiquant le statut du robot (bleu, vert, orange ou rouge) visible a 360 degres "
            "par les operateurs."
        ),
        (
            "2. Directives d'Installation & Cablage",
            "L'embase presente une empreinte de montage de O149 mm. La fixation s'effectue via 4 vis M6 "
            "sur un gabarit (PCD) de O63 mm. Le robot peut etre monte dans n'importe quelle orientation "
            "(sol, plafond, mur, plan incline). Attention aux couples de serrage stricts : 9 N.m pour un "
            "montage au sol/mur, et 12 N.m pour une fixation au plafond."
        ),
        (
            "3. Securite & Fonctions PFL",
            "Cette articulation est soumise aux normes de limitation de puissance et de force "
            "(PFL - ISO/TR 20218-1). En cas de coupure d'alimentation, un frein a ressort fail-safe "
            "s'engage instantanement pour figer l'axe et eviter une chute du bras par gravite. Les "
            "limites de rotation logicielles doivent etre configurees dans PolyScope pour eviter "
            "l'enroulement des cables externes."
        ),
        (
            "4. Recommandations de Maintenance",
            "Protegee IP54, la base necessite peu d'entretien mecanique. Lors des maintenances "
            "preventives, verifiez l'integrite visuelle du couvercle (Lid set UR5e - Ref: 103405), "
            "le serrage des 4 vis de fixation M6 au couple recommande, et l'absence de contrainte "
            "sur le cable principal en sortie d'embase."
        ),
    ],
))

# ---- 2. Epaule (Joint 2) ----
PARTS.append(dict(
    filename="fiche_epaule_joint2.pdf",
    part_name="Epaule (Joint 2 - Shoulder)",
    part_id=2,
    category="Identification",
    ref=None,
    specs=[
        ("Designation",   "Joint 2 - Shoulder"),
        ("Taille joint",  "Size 1 (grand)"),
        ("Plage mouvement","+/- 360 deg"),
        ("Vitesse max",   "180 deg/s"),
        ("Moteur",        "Brushless BLDC"),
        ("Reducteur",     "Harmonique (jeu zero)"),
        ("Encodeur",      "Absolu multi-tours"),
        ("Frein",         "Fail-safe"),
        ("Capteurs",      "Courant moteur"),
    ],
    sections=[
        (
            "1. Principe",
            "L'Epaule (Joint 2) est l'articulation critique gerant la levee du bras dans le plan "
            "vertical. Equipee d'un moteur Brushless sans balais (BLDC) et d'un reducteur harmonique "
            "(Harmonic Drive) a jeu zero, elle encaisse le couple mecanique le plus fort de la "
            "structure (supportant la charge utile de 5 kg pour l'UR5e). Elle integre un encodeur "
            "absolu multi-tours pour un positionnement spatial instantane au demarrage."
        ),
        (
            "2. Installation",
            "Lors de l'installation, assurez-vous de laisser un degagement suffisant autour de "
            "l'epaule pour permettre sa rotation complete de +/-360 deg. Aucune fixation externe "
            "n'est requise, mais l'axe doit etre degage de tout obstacle rigide qui pourrait "
            "endommager le carter en aluminium lors de la programmation des trajectoires."
        ),
        (
            "3. Securite",
            "L'epaule est le premier axe surveillant la gravite. Ses capteurs de courant moteur "
            "detectent les variations anormales de charge, declenchant un arret de protection en "
            "cas de collision (Protective Stop). Le frein electromagnetique integre est dimensionne "
            "pour retenir la charge maximale meme en cas de coupure electrique d'urgence "
            "(Categorie 0)."
        ),
        (
            "4. Maintenance",
            "La duree de vie nominale de l'articulation est de 35 000 heures. Il est recommande "
            "d'ecouter regulierement le reducteur harmonique lors des mouvements a pleine vitesse "
            "(180 deg/s) : tout bruit de cliquetis ou de grincement anormal peut indiquer une "
            "usure prematuree necessitant un remplacement du joint (Taille 1)."
        ),
    ],
))

# ---- 3. Bras superieur ----
PARTS.append(dict(
    filename="fiche_bras_superieur.pdf",
    part_name="Bras superieur (Upper Arm)",
    part_id=3,
    category="Identification",
    ref=None,
    specs=[
        ("Designation",          "Bras superieur (Upper Arm)"),
        ("Longueur J2-J3",       "425 mm"),
        ("Materiau",             "Aluminium anodise"),
        ("Protection IP",        "IP54"),
        ("Contribution portee max","425 mm sur 850 mm"),
        ("Repetabilite",         "+/- 0.03 mm (ISO 9283)"),
    ],
    sections=[
        (
            "1. Principe",
            "Le bras superieur est un segment mecanique rigide en aluminium anodise reliant l'epaule "
            "(Joint 2) au coude (Joint 3). Mesurant 425 mm, c'est le segment le plus long du robot. "
            "Il ne contient pas de moteur, mais sa rigidite structurelle est primordiale pour garantir "
            "la repetabilite globale du robot (+/-0.03 mm selon la norme ISO 9283), meme a la portee "
            "maximale."
        ),
        (
            "2. Installation",
            "Ce segment est concu pour etre lisse afin de faciliter le nettoyage et minimiser les "
            "risques d'accrochage. Si des cables ou tuyaux pneumatiques externes doivent etre routes "
            "jusqu'a l'outil, il est recommande d'utiliser des colliers de serrage specifiques ou "
            "une gaine annelee fixee de maniere lache pour accompagner les mouvements sans restreindre "
            "les articulations adjacentes."
        ),
        (
            "3. Securite",
            "Attention au risque de pincement (pinch points) : lors du repli du robot sur lui-meme, "
            "l'espace entre le bras superieur et l'avant-bras se reduit. Les fonctions de securite "
            "PFL doivent etre parametrees dans PolyScope pour limiter la vitesse de fermeture de cet "
            "angle si des operateurs travaillent a proximite immediate."
        ),
        (
            "4. Maintenance",
            "Le tube beneficie d'un indice de protection IP54. L'entretien se limite a un nettoyage "
            "externe de surface avec un chiffon doux et un detergent doux. Ne pas utiliser de solvants "
            "abrasifs qui pourraient degrader l'anodisation de l'aluminium."
        ),
    ],
))

# ---- 4. Coude (Joint 3) ----
PARTS.append(dict(
    filename="fiche_coude_joint3.pdf",
    part_name="Coude (Joint 3 - Elbow)",
    part_id=4,
    category="Identification",
    ref=None,
    specs=[
        ("Designation",       "Joint 3 - Elbow"),
        ("Taille joint",      "Size 1 (grand)"),
        ("Plage mouvement",   "+/- 360 deg"),
        ("Vitesse max",       "180 deg/s"),
        ("Moteur",            "Brushless BLDC"),
        ("Reducteur",         "Harmonique"),
        ("Encodeur",          "Absolu"),
        ("Frein",             "Fail-safe"),
        ("Fonctions securite","Elbow Speed Limit + Elbow Force Limit (PLd Cat.3)"),
    ],
    sections=[
        (
            "1. Principe",
            "Le Coude (Joint 3) est l'articulation centrale de taille Size 1 reliant les segments "
            "superieur et inferieur. Elle offre une amplitude de +/-360 deg et permet de plier ou "
            "d'etendre le bras. Sa position est determinante pour la portee maximale du robot "
            "(850 mm pour UR5e)."
        ),
        (
            "2. Installation",
            "Bien que l'articulation permette un mouvement a 360 deg, la programmation des "
            "trajectoires doit eviter de solliciter le coude a ses limites physiques extremes de "
            "maniere repetee avec de fortes charges, afin d'optimiser la duree de vie du reducteur "
            "harmonique."
        ),
        (
            "3. Securite",
            "Le coude est au coeur du systeme de securite de l'e-Series. Il dispose de deux "
            "fonctions de securite dediees classees PLd Cat. 3 : Elbow Speed Limit (Limitation de "
            "la vitesse du coude) et Elbow Force Limit (Limitation de la force du coude). Ces "
            "parametres restreignent l'energie cinetique globale du bras avant meme qu'il ne "
            "touche l'outil, protegeant ainsi le haut du corps d'un operateur lors d'une collision."
        ),
        (
            "4. Maintenance",
            "Les capots bleus d'etancheite (Lid Set) doivent etre verifies. Si le robot evolue "
            "dans un environnement poussieureux ou humide (bien que limite a IP54), surveillez "
            "l'absence de condensation sous les joints toriques pour eviter l'oxydation de "
            "l'encodeur absolu interne."
        ),
    ],
))

# ---- 5. Avant-bras ----
PARTS.append(dict(
    filename="fiche_avant_bras.pdf",
    part_name="Avant-bras (Forearm)",
    part_id=5,
    category="Identification",
    ref=None,
    specs=[
        ("Designation",       "Avant-bras (Forearm)"),
        ("Longueur J3-J5",    "~392 mm"),
        ("Materiau",          "Aluminium anodise"),
        ("Protection IP",     "IP54"),
        ("Portee max TCP",    "850 mm"),
        ("Hauteur position zero","~1000 mm"),
    ],
    sections=[
        (
            "1. Principe",
            "L'avant-bras est le second segment tubulaire en aluminium anodise du robot, d'une "
            "longueur d'environ 392 mm. Il fait la liaison entre le coude massif et le premier "
            "poignet fin (Wrist 1). Sa legerete est optimisee pour reduire l'inertie lors des "
            "deplacements rapides des trois axes du poignet."
        ),
        (
            "2. Installation",
            "C'est souvent sur ce segment que sont fixes les boitiers de distribution pneumatique "
            "ou les modules de controle d'effecteurs (distributeurs, vannes). Les fixations doivent "
            "etre legeres et leur poids (ainsi que leur centre de gravite) doit etre declare dans "
            "le menu Payload de PolyScope, sans quoi le systeme PFL detectera une anomalie de masse."
        ),
        (
            "3. Securite",
            "Le deplacement de ce segment balaie une zone spatiale importante. Lors de l'evaluation "
            "des risques (ISO 10218-1), la vitesse de balayage de l'avant-bras doit etre restreinte "
            "dans les plans de securite (Safety Planes) si l'espace de travail interfere avec un "
            "passage pieton en atelier."
        ),
        (
            "4. Maintenance",
            "Meme consigne que pour le bras superieur : nettoyage de surface regulier. En cas de "
            "rayure profonde, surveillez l'apparition de microfissures si le robot porte "
            "frequemment des charges proches de sa limite (5 kg)."
        ),
    ],
))

# ---- 6. Poignet 1 (Joint 4) ----
PARTS.append(dict(
    filename="fiche_poignet1_joint4.pdf",
    part_name="Poignet 1 (Joint 4 - Wrist 1)",
    part_id=6,
    category="Pieces detachees",
    ref="124100",
    specs=[
        ("Designation",    "Joint 4 - Wrist 1"),
        ("Taille joint",   "Size 0 (petit)"),
        ("Plage mouvement","+/- 360 deg"),
        ("Vitesse max",    "180 deg/s"),
        ("Moteur",         "Brushless BLDC"),
        ("Reducteur",      "Harmonique"),
        ("Encodeur",       "Absolu"),
        ("Frein",          "Fail-safe"),
        ("Reference piece","124100"),
        ("Duree vie",      "35 000 heures"),
    ],
    sections=[
        (
            "1. Principe",
            "Le Poignet 1 marque la transition de la geometrie du robot vers des articulations de "
            "Taille 0 (plus petites, Ref: 124100). Sa fonction principale n'est pas la portee, "
            "mais l'orientation spatiale de l'outil. Il est capable de vitesses angulaires tres "
            "elevees (jusqu'a 180 deg/s) et utilise un motoreducteur tres compact pour maximiser "
            "la dexterite."
        ),
        (
            "2. Installation",
            "Les axes des poignets peuvent etre soumis a des singularites cinematiques (lorsque "
            "plusieurs axes s'alignent parfaitement, le robot ne sait plus comment calculer son "
            "mouvement). Lors de la programmation d'une trajectoire lineaire (MoveL), veillez a ce "
            "que l'angle du Wrist 1 ne s'approche pas de 0 ou 180 deg par rapport a l'avant-bras "
            "de maniere prolongee."
        ),
        (
            "3. Securite",
            "Etant plus proche de l'outil, cette articulation reagit tres rapidement aux collisions "
            "detectees. Ses limites de vitesse sont souvent les premieres a etre drastiquement "
            "reduites lors du passage en Mode Collaboratif (Reduced Mode) via PolyScope."
        ),
        (
            "4. Maintenance",
            "Les poignets etant tres mobiles, la graisse a l'interieur des reducteurs harmoniques "
            "est fortement sollicitee. Bien que lubrifies a vie (35 000 heures), les joints toriques "
            "(O-rings) de taille 0 peuvent secher. Une inspection visuelle tous les ans est "
            "recommandee pour detecter d'eventuels suintements de graisse."
        ),
    ],
))

# ---- 7. Poignet 2 (Joint 5) ----
PARTS.append(dict(
    filename="fiche_poignet2_joint5.pdf",
    part_name="Poignet 2 (Joint 5 - Wrist 2)",
    part_id=7,
    category="Pieces detachees",
    ref="124101",
    specs=[
        ("Designation",    "Joint 5 - Wrist 2"),
        ("Taille joint",   "Size 0 (petit)"),
        ("Plage mouvement","+/- 360 deg"),
        ("Vitesse max",    "180 deg/s"),
        ("Moteur",         "Brushless BLDC"),
        ("Reducteur",      "Harmonique"),
        ("Encodeur",       "Absolu"),
        ("Frein",          "Fail-safe"),
        ("Reference piece","124101"),
        ("Duree vie",      "35 000 heures"),
    ],
    sections=[
        (
            "1. Principe",
            "Le Poignet 2 (Taille 0, Ref: 124101) travaille en coordination croisee a 90 degres "
            "avec Wrist 1 et Wrist 3. C'est l'axe de tangage qui permet de faire basculer l'outil "
            "de haut en bas ou de gauche a droite. Il participe a la flexibilite spherique de "
            "l'extremite du bras, primordiale pour des taches comme le vissage, l'assemblage ou "
            "le soudage."
        ),
        (
            "2. Installation",
            "Memes precautions que le Wrist 1 concernant les singularites. De plus, c'est autour "
            "de ce poignet que les cables de l'outil final (effecteur) risquent le plus de se "
            "vriller. Prevoyez un rayon de courbure minimal de 50 mm pour les cables passant a "
            "proximite."
        ),
        (
            "3. Securite",
            "En mode collaboratif, le Wrist 2 est souvent l'articulation la plus mobile car elle "
            "permet des reorientations rapides de l'outil. Sa vitesse doit etre bornee dans le "
            "profil de securite collaboratif pour garantir une force de contact inferieure a 150 N "
            "(recommandation ISO/TS 15066)."
        ),
        (
            "4. Maintenance",
            "Memes procedures que le Wrist 1 (Ref: 124100). Attention particuliere aux O-rings qui "
            "assurent l'etancheite IP54 : si le robot est utilise en environnement humide ou avec "
            "des projections de liquide de coupe, verifier l'etancheite tous les 6 mois."
        ),
    ],
))

# ---- 8. Poignet 3 + Bride (Joint 6) ----
PARTS.append(dict(
    filename="fiche_poignet3_bride_joint6.pdf",
    part_name="Poignet 3 + Bride outil (Joint 6)",
    part_id=8,
    category="Pieces detachees",
    ref="102414",
    specs=[
        ("Designation",          "Joint 6 - Wrist 3 + Tool Flange"),
        ("Taille joint",         "Size 0 (petit)"),
        ("Plage mouvement",      "+/- 360 deg (continu)"),
        ("Vitesse max",          "180 deg/s"),
        ("Bride outil",          "ISO 9409-1-50-4-M6"),
        ("Alim. outil (interne)","24V, 0-2A"),
        ("Signal. outil (interne)","4 entrees + 4 sorties numeriques"),
        ("Reference piece",      "102414"),
        ("Duree vie",            "35 000 heures"),
    ],
    sections=[
        (
            "1. Principe",
            "Le Poignet 3 (Wrist 3, Ref: 102414) est l'axe distal du robot, integrant directement "
            "la bride outil (Tool Flange) normalisee ISO 9409-1-50-4-M6. Il est unique car il peut "
            "tourner en continu sans limite (rotation infinie). Il integre en interne les connexions "
            "electriques pour l'alimentation et le controle de l'effecteur, eliminant le besoin de "
            "cables externes s'enroulant autour du poignet."
        ),
        (
            "2. Installation",
            "La bride outil presente 4 trous de fixation M6 sur un cercle de O50 mm (norme "
            "ISO 9409-1). L'effecteur (pince, ventouse, outil de vissage...) doit etre fixe avec "
            "des vis M6 de classe 8.8 minimum au couple de 9 N.m. Les connexions electriques "
            "internes (24V/2A, 4DI/4DO) se font via le connecteur M8 presente en face de la bride."
        ),
        (
            "3. Securite",
            "Etant le dernier axe, c'est lui qui determine directement la vitesse de l'outil TCP "
            "(Tool Center Point). Sa vitesse est le premier parametre surveille par la fonction "
            "Tool Speed Limit (PLd Cat.3). En mode collaboratif, la vitesse TCP est generalement "
            "bornee a 250 mm/s maximum."
        ),
        (
            "4. Maintenance",
            "C'est l'articulation la plus exposee aux sollicitations mecaniques liees a l'outil. "
            "Verifier regulierement le serrage des vis de fixation de l'effecteur (risque de "
            "desserrage par vibrations) et l'etat du connecteur M8 (risque de corrosion en "
            "environnement humide). Inspecter l'O-ring d'etancheite autour de la bride tous les "
            "6 mois."
        ),
    ],
))

# ---- 9. Boitier de commande ----
PARTS.append(dict(
    filename="fiche_boitier_commande.pdf",
    part_name="Boitier de commande (Control Box)",
    part_id=9,
    category="Alimentation",
    ref=None,
    specs=[
        ("Designation",         "Control Box CB-2"),
        ("Dimensions",          "475 x 423 x 268 mm"),
        ("Poids",               "21.2 kg"),
        ("Alimentation",        "100-240 VAC, 47-440 Hz"),
        ("Conso. typique",      "200 W"),
        ("Conso. maximale",     "570 W"),
        ("Connexion robot",     "Cable 6 m (standard)"),
        ("Interface utilisateur","PolyScope (GUI Teach Pendant)"),
        ("Degre protection",    "IP44"),
        ("Temp. fonctionnement","0 degC - 50 degC"),
        ("Connexions E/S",      "16 DI + 16 DO + 2 AI + 2 AO"),
    ],
    sections=[
        (
            "1. Principe",
            "Le Boitier de Commande (Control Box CB-2) est le cerveau du systeme. Il contient le "
            "controleur temps-reel qui execute les trajectoires PolyScope, les variateurs d'axes "
            "pour les 6 moteurs BLDC, l'alimentation a decoupage et le bloc de securite certifie "
            "PLd Cat.3. Il communique avec le bras via un cable proprietaire de 6 metres et avec "
            "le Teach Pendant via USB ou reseau."
        ),
        (
            "2. Installation",
            "Le boitier doit etre installe dans une armoire electrique ventilee (IP44 minimum) a "
            "distance du robot pour proteger l'operateur. Prevoir une alimentation secteur "
            "100-240 VAC (47-440 Hz) avec un disjoncteur dedie de 16A. Le cable robot de 6 m doit "
            "etre pose dans un chemin de cables separe des cables de puissance industriels pour "
            "eviter les perturbations CEM."
        ),
        (
            "3. Securite",
            "Le Control Box integre un circuit de securite certifie PLd Cat.3 gerant les arrets "
            "d'urgence (3 entrees E-Stop redondantes), les dispositifs d'activation (3-position "
            "enabling device), les arrets de protection (Protective Stop) et la reduction de mode "
            "(Reduced Mode). Toutes les entrees de securite sont cablees en redondance sur des "
            "circuits separes galvaniquement."
        ),
        (
            "4. Maintenance",
            "Le filtre a air du ventilateur interne doit etre nettoye tous les 3 mois (ou plus "
            "frequemment en environnement poussieureux). Verifier annuellement l'etat des "
            "connexions E/S (oxydation des cosses en environnement humide) et le serrage du cable "
            "robot sur le connecteur M23. En cas de defaut ventilateur (alarme CB_FAN), intervenir "
            "dans les 24h pour eviter la surchauffe des composants electroniques."
        ),
    ],
))

# ---- 10. Teach Pendant ----
PARTS.append(dict(
    filename="fiche_teach_pendant.pdf",
    part_name="Teach Pendant (TP5)",
    part_id=10,
    category="Identification",
    ref=None,
    specs=[
        ("Designation",         "Teach Pendant TP5"),
        ("Ecran",               "Tactile 12\" 1280x800 px"),
        ("Poids",               "1.4 kg"),
        ("Interface logicielle","PolyScope 5.x / PolyScope X"),
        ("Bouton arret urgence","Oui (rouge, cadenassable)"),
        ("Dispositif activation","Oui (Dead Man Switch 3 pos.)"),
        ("Connexion",           "USB vers Control Box"),
        ("Degre protection",    "IP54"),
        ("Batterie",            "Li-Ion (30 min autonomie)"),
        ("Luminosite ecran",    "400 cd/m2"),
    ],
    sections=[
        (
            "1. Principe",
            "Le Teach Pendant TP5 est l'interface homme-machine (HMI) principale du systeme. "
            "C'est une tablette industrielle durcie (IP54) equipee du logiciel PolyScope. Il "
            "permet la programmation des trajectoires (waypoints), la configuration des parametres "
            "de securite, le monitoring en temps reel des axes et la gestion des E/S. Il dispose "
            "d'un bouton d'arret d'urgence rouge en face avant et d'un dispositif d'activation a "
            "3 positions (Dead Man Switch) a l'arriere pour le mode Manuel."
        ),
        (
            "2. Installation",
            "Le Teach Pendant se connecte au Control Box via un cable USB industriel. Il doit etre "
            "maintenu dans son support de rangement prevu a cet effet (mural ou sur l'armoire) "
            "lorsqu'il n'est pas utilise, pour eviter les chutes. Son ecran tactile necessite une "
            "calibration initiale si des incoherences de pointage sont detectees "
            "(menu Settings > System > Screen Calibration)."
        ),
        (
            "3. Securite",
            "Le bouton E-Stop rouge du Teach Pendant est l'un des 3 arrets d'urgence redondants "
            "du systeme. En mode Manuel (T1 < 250 mm/s, T2 < vitesse programmee), le Dead Man "
            "Switch doit etre maintenu enfonce a mi-course pour autoriser le mouvement. Le relacher "
            "ou l'enfoncer completement provoque un arret immediat de Categorie 0."
        ),
        (
            "4. Maintenance",
            "Nettoyer l'ecran tactile avec un chiffon microfibre legerement humide (sans solvant). "
            "Verifier l'etat du cable USB (risque de rupture des conducteurs par torsion repetee). "
            "La batterie interne Li-Ion (autonomie 30 min) se decharge naturellement : charger le "
            "pendant au moins une fois par semaine si le robot est peu utilise pour preserver la "
            "capacite de la batterie."
        ),
    ],
))

# ===========================================================================
# Main — generate all PDFs
# ===========================================================================
if __name__ == "__main__":
    OUTPUT_DIR = r"C:\Users\malau\Documents\iut cours\programmation iut\SAE_dispositif_interactif\SAE402\docs"
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Generating {} PDFs in:".format(len(PARTS)))
    print("  {}".format(OUTPUT_DIR))
    print()

    for part in PARTS:
        filepath = os.path.join(OUTPUT_DIR, part["filename"])
        build_pdf(
            filepath=filepath,
            part_name=part["part_name"],
            part_id=part["part_id"],
            category=part["category"],
            specs=part["specs"],
            sections=part["sections"],
            ref=part.get("ref"),
        )

    print()
    print("All PDFs generated successfully.")
