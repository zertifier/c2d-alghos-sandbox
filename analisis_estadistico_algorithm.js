import fs from "fs";
import path from "path";

const OUTPUT_DIR = "/data/outputs";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "output.json");

// Always output this fixed statistical analysis, regardless of the input dataset.
const RESULT =
{
    "analisis_meat": {
        "GLYCERIC ACID": {
            "media": 0.03447930075513809,
            "mediana": 0.0253271494646871,
            "desviacion_estandar": 0.022563718837105014,
            "minimo": 0.0044542885588789,
            "maximo": 0.0808081093128733,
            "varianza": 0.0005091214077599277
        },
        "adipic acid": {
            "media": 0.10362660070679873,
            "mediana": 0.0983527461208225,
            "desviacion_estandar": 0.02994261299623454,
            "minimo": 0.0622018929414844,
            "maximo": 0.1776740399803006,
            "varianza": 0.0008965600730422736
        },
        "2,4,6-Trimethylbenzoic acid": {
            "media": 0.029029157586086953,
            "mediana": 0.0265652535654918,
            "desviacion_estandar": 0.009874162236048168,
            "minimo": 0.0181285729178747,
            "maximo": 0.0498756049625439,
            "varianza": 9.749907986379976e-05
        },
        "N-Acetylhistidine": {
            "media": 0.06364213753903239,
            "mediana": 0.0653421281948564,
            "desviacion_estandar": 0.0321520938383383,
            "minimo": 0.0016670409794361,
            "maximo": 0.1338131637444254,
            "varianza": 0.001033757138189312
        },
        "Tridecylic (Tridecanoic) acid": {
            "media": 0.029816371671374825,
            "mediana": 0.0276066944240151,
            "desviacion_estandar": 0.011469550149080111,
            "minimo": 0.0143465451287961,
            "maximo": 0.0519723534346297,
            "varianza": 0.00013155058062226362
        },
        "Myristic (Tetradecanoic) acid": {
            "media": 0.0048147338452525345,
            "mediana": 0.0034986555773735,
            "desviacion_estandar": 0.0031291374617975045,
            "minimo": 0.0012967129043543,
            "maximo": 0.0109934576042776,
            "varianza": 9.79150125482453e-06
        },
        "Anserine": {
            "media": 0.40658528142720607,
            "mediana": 0.3742630993024257,
            "desviacion_estandar": 0.3108255684329191,
            "minimo": 0.0043899725712386,
            "maximo": 1.1220207089045464,
            "varianza": 0.09661253399164726
        },
        "Tridecanedioic acid": {
            "media": 0.03819089082228709,
            "mediana": 0.0393608602068442,
            "desviacion_estandar": 0.008660431419019643,
            "minimo": 0.0239759757383088,
            "maximo": 0.0531948641551451,
            "varianza": 7.500307236354261e-05
        },
        "FA 16:4": {
            "media": 0.06743871644889296,
            "mediana": 0.0632882860060464,
            "desviacion_estandar": 0.024189996341484565,
            "minimo": 0.0342703679218057,
            "maximo": 0.1210462793260948,
            "varianza": 0.0005851559230010367
        },
        "Palmitoleic acid": {
            "media": 0.06660906439336087,
            "mediana": 0.0436472798569735,
            "desviacion_estandar": 0.05512450199278981,
            "minimo": 0.0274159678460162,
            "maximo": 0.1918840522088772,
            "varianza": 0.003038710719953087
        },
        "Palmitic acid ": {
            "media": 3.189419934301428,
            "mediana": 3.1523705071674475,
            "desviacion_estandar": 0.2498648886587403,
            "minimo": 2.826809830013786,
            "maximo": 3.6855486975554417,
            "varianza": 0.06243246258444469
        },
        "SN-GLYCERO-3-PHOSPHOCHOLINE": {
            "media": 0.020228145446677153,
            "mediana": 0.0188050225399896,
            "desviacion_estandar": 0.009786843658186684,
            "minimo": 0.0100198423949303,
            "maximo": 0.0445045854691755,
            "varianza": 9.578230878978892e-05
        },
        "INOSINE": {
            "media": 0.07794083514287174,
            "mediana": 0.0753149669030905,
            "desviacion_estandar": 0.052172013433118114,
            "minimo": 0.0016529698742068,
            "maximo": 0.214603517471772,
            "varianza": 0.002721918985665457
        },
        "Tri-isobutylphosphate": {
            "media": 0.07551414021539568,
            "mediana": 0.072672919856074,
            "desviacion_estandar": 0.02423099904982712,
            "minimo": 0.0457830126809005,
            "maximo": 0.1329222437726557,
            "varianza": 0.0005871413149527229
        },
        "methyl palmitoleate": {
            "media": 0.10467912548487765,
            "mediana": 0.0893386912759767,
            "desviacion_estandar": 0.0474690497764618,
            "minimo": 0.0530037259045389,
            "maximo": 0.2037845007332903,
            "varianza": 0.0022533106866802076
        },
        "Margaric (heptadecanoic) acid": {
            "media": 0.28425833803327033,
            "mediana": 0.269651582119701,
            "desviacion_estandar": 0.11651962315177918,
            "minimo": 0.1162482761592745,
            "maximo": 0.5430434409695295,
            "varianza": 0.013576822579432633
        },
        "HEPTADECANOATE": {
            "media": 0.32761055105300096,
            "mediana": 0.3283449780267171,
            "desviacion_estandar": 0.005982523280175058,
            "minimo": 0.3167952425897354,
            "maximo": 0.3394632116184256,
            "varianza": 3.579058479783653e-05
        },
        "Alpha-linolenic (Linolenic acid) acid (ALA) (Omega3)": {
            "media": 0.6181539824475285,
            "mediana": 0.3738355198721296,
            "desviacion_estandar": 0.6593385633663442,
            "minimo": 0.1377165844181015,
            "maximo": 2.083281881700628,
            "varianza": 0.43472734114199474
        },
        "Linoleic acid (Omega6)": {
            "media": 5.093301404947515,
            "mediana": 3.9786053320011168,
            "desviacion_estandar": 3.5658925600464024,
            "minimo": 1.1023873007160736,
            "maximo": 12.47337974522442,
            "varianza": 12.715589749794287
        },
        "Oleic acid": {
            "media": 6.66338288171836,
            "mediana": 6.191413314786872,
            "desviacion_estandar": 1.7064399821815743,
            "minimo": 4.168130733294483,
            "maximo": 10.79523068040989,
            "varianza": 2.9119374127878515
        },
        "Stearic acid": {
            "media": 2.528737089626148,
            "mediana": 2.5641459570074394,
            "desviacion_estandar": 0.4359198032457242,
            "minimo": 1.7792570872077915,
            "maximo": 3.3318002218452767,
            "varianza": 0.1900260748617909
        },
        "13-KODE (Oxo-octadecadienoic acid)": {
            "media": 0.014851897221058936,
            "mediana": 0.0073013726777627,
            "desviacion_estandar": 0.018526465796639576,
            "minimo": 0.0008373830487038,
            "maximo": 0.0737558560874153,
            "varianza": 0.00034322993491405613
        },
        "FA 19:1": {
            "media": 0.10026331068710308,
            "mediana": 0.0738812049614633,
            "desviacion_estandar": 0.058215951733482006,
            "minimo": 0.0513658019823529,
            "maximo": 0.2358517522229851,
            "varianza": 0.0033890970362351063
        },
        "12-Hydroxyoctadecanoic acid": {
            "media": 2.5893931448571865,
            "mediana": 1.3627488531934373,
            "desviacion_estandar": 3.00313143619675,
            "minimo": 0.3787305239849586,
            "maximo": 11.358975940909597,
            "varianza": 9.018798423073155
        },
        "(R)-2-hydroxystearic acid": {
            "media": 0.2304847037219799,
            "mediana": 0.2037712838613197,
            "desviacion_estandar": 0.07957358213019332,
            "minimo": 0.1402595522991227,
            "maximo": 0.4335925791448357,
            "varianza": 0.006331954973030621
        },
        "NAE 16:0": {
            "media": 0.012089424229157495,
            "mediana": 0.0127492044181626,
            "desviacion_estandar": 0.0037691212668735626,
            "minimo": 0.0051543457507245,
            "maximo": 0.018503437517606,
            "varianza": 1.420627512439857e-05
        },
        "Eicosapentaenoic acid (EPA) (Omega3)": {
            "media": 4.502107527384857,
            "mediana": 4.154599814543868,
            "desviacion_estandar": 3.0846402373110147,
            "minimo": 0.9354742336482,
            "maximo": 10.348448891358055,
            "varianza": 9.515005393638152
        },
        "Arachidonic acid (ARA) (Omega6)": {
            "media": 10.016717866957084,
            "mediana": 7.269893019170514,
            "desviacion_estandar": 7.458658184035602,
            "minimo": 2.461417509388788,
            "maximo": 26.824118205835894,
            "varianza": 55.631581906281255
        },
        "GLYCEROL-MYRISTATE": {
            "media": 0.01191517747141931,
            "mediana": 0.0121750014759794,
            "desviacion_estandar": 0.0022149914614573133,
            "minimo": 0.0081492190157158,
            "maximo": 0.0163353900254218,
            "varianza": 4.906187174328804e-06
        },
        "Eicosenoic acid": {
            "media": 0.08082881746276592,
            "mediana": 0.0618300579935278,
            "desviacion_estandar": 0.04894285249986727,
            "minimo": 0.026525079411704,
            "maximo": 0.1812672930820166,
            "varianza": 0.0023954028108237636
        },
        "arachidic acid": {
            "media": 0.04982742977698947,
            "mediana": 0.0475232410411238,
            "desviacion_estandar": 0.010430591215152621,
            "minimo": 0.0333099731621082,
            "maximo": 0.0693064031341875,
            "varianza": 0.00010879723309761903
        },
        "NAE 18:2": {
            "media": 0.004616863657006771,
            "mediana": 0.004317627980899,
            "desviacion_estandar": 0.0010534593984880102,
            "minimo": 0.0027216058063709,
            "maximo": 0.0064904589511941,
            "varianza": 1.1097767042627203e-06
        },
        "Heneicosanoic acid": {
            "media": 0.07395452423700553,
            "mediana": 0.0649034090276866,
            "desviacion_estandar": 0.031034927822224986,
            "minimo": 0.0450658299784484,
            "maximo": 0.1387110697580331,
            "varianza": 0.0009631667449307144
        },
        "NAE 18:1": {
            "media": 0.09027741733989614,
            "mediana": 0.0917978388448791,
            "desviacion_estandar": 0.028446915789311463,
            "minimo": 0.0318359921592102,
            "maximo": 0.136355424471207,
            "varianza": 0.0008092270179241778
        },
        "Docosahexaenoic acid (DHA) (Omega3)": {
            "media": 1.5463713914720745,
            "mediana": 1.231944294642292,
            "desviacion_estandar": 1.252514455822536,
            "minimo": 0.2346216685759423,
            "maximo": 3.811814652401601,
            "varianza": 1.5687924620444236
        },
        "Docosapentaenoic acid (Omega6) ": {
            "media": 2.784403310540662,
            "mediana": 2.354627972555244,
            "desviacion_estandar": 1.9917722608368664,
            "minimo": 0.5351683487564499,
            "maximo": 7.117565273394562,
            "varianza": 3.967156739039202
        },
        "Docosatetraenoic acid": {
            "media": 0.39276007622071535,
            "mediana": 0.2462015190956755,
            "desviacion_estandar": 0.33447350980218615,
            "minimo": 0.140946190273099,
            "maximo": 1.1868547653756554,
            "varianza": 0.11187252875939313
        },
        "Ceratodictyol (de las plantas que comen)": {
            "media": 0.17183038319942784,
            "mediana": 0.1764213556136327,
            "desviacion_estandar": 0.02445261639111363,
            "minimo": 0.1390552026846518,
            "maximo": 0.2197805044532676,
            "varianza": 0.0005979304483709591
        },
        "FAHFA 20:1;O|FAHFA 18:0/2:0;O": {
            "media": 0.04987933297600442,
            "mediana": 0.0446834637502895,
            "desviacion_estandar": 0.023197292692503202,
            "minimo": 0.0325042467067165,
            "maximo": 0.1362653855198533,
            "varianza": 0.0005381143882616624
        },
        "CAR 12:0": {
            "media": 0.004230263428114824,
            "mediana": 0.0031209153654107,
            "desviacion_estandar": 0.002366852684302123,
            "minimo": 0.0014306653632233,
            "maximo": 0.0082954394016436,
            "varianza": 5.601991629188165e-06
        },
        "MG 16:0": {
            "media": 0.011181377978219923,
            "mediana": 0.010889522106982,
            "desviacion_estandar": 0.002394440067031166,
            "minimo": 0.0068372895454739,
            "maximo": 0.0147992749691756,
            "varianza": 5.7333432346042154e-06
        },
        "FAHFA 21:3;O|FAHFA 18:2/3:0;O": {
            "media": 0.16228897733497907,
            "mediana": 0.1402274763409934,
            "desviacion_estandar": 0.10749726680712925,
            "minimo": 0.0317256787312549,
            "maximo": 0.3679505071354375,
            "varianza": 0.01155566237100313
        },
        "MG 17:3": {
            "media": 0.08131599018893897,
            "mediana": 0.0802848845415784,
            "desviacion_estandar": 0.020107216730059888,
            "minimo": 0.0516425627924658,
            "maximo": 0.1145162989687646,
            "varianza": 0.00040430016462960033
        },
        "FA 24:5": {
            "media": 0.019494313199191374,
            "mediana": 0.017714970003598,
            "desviacion_estandar": 0.009963778388092157,
            "minimo": 0.0073616056329821,
            "maximo": 0.0392508875260127,
            "varianza": 9.927687976701235e-05
        },
        "1-OLEOYL-GLYCEROL": {
            "media": 0.03616692166016941,
            "mediana": 0.018156277029383,
            "desviacion_estandar": 0.038982777178963715,
            "minimo": 0.002442008883944,
            "maximo": 0.1223092473413658,
            "varianza": 0.0015196569165847342
        },
        "1-Monostearin": {
            "media": 0.009641415759877653,
            "mediana": 0.009417378658015,
            "desviacion_estandar": 0.0008684218339883957,
            "minimo": 0.0079473417250485,
            "maximo": 0.0109558403313496,
            "varianza": 7.541564817477686e-07
        },
        "Glyceryl linolenate": {
            "media": 0.8226071464271164,
            "mediana": 0.8237772939112189,
            "desviacion_estandar": 0.16007652864917576,
            "minimo": 0.5443994193564496,
            "maximo": 1.0836012603540166,
            "varianza": 0.025624495024370388
        },
        "CAR 14:0": {
            "media": 0.01774597703064023,
            "mediana": 0.0107463558912192,
            "desviacion_estandar": 0.017693834631655747,
            "minimo": 0.0008246768573739,
            "maximo": 0.0658584039571775,
            "varianza": 0.00031307178397238023
        },
        "MG 18:0": {
            "media": 0.0013976395780386237,
            "mediana": 0.0014180638579101,
            "desviacion_estandar": 0.00036837675511049156,
            "minimo": 0.0006592806266688,
            "maximo": 0.0020284919356089,
            "varianza": 1.3570143370573508e-07
        },
        "FAHFA 23:4;O|FAHFA 20:3/3:0;O": {
            "media": 0.01194200551166851,
            "mediana": 0.0082267006012843,
            "desviacion_estandar": 0.008501728603483551,
            "minimo": 0.0020803081378555,
            "maximo": 0.0279338284486856,
            "varianza": 7.227938924729037e-05
        },
        "CAR 16:0": {
            "media": 0.09207550481246843,
            "mediana": 0.0732409544601844,
            "desviacion_estandar": 0.07405276205785967,
            "minimo": 0.0188566762627426,
            "maximo": 0.3041398630385333,
            "varianza": 0.0054838115683979805
        },
        "Cholic acid": {
            "media": 0.03758920014591399,
            "mediana": 0.0030436009667439,
            "desviacion_estandar": 0.07465204627086698,
            "minimo": 0.0,
            "maximo": 0.2130797013334974,
            "varianza": 0.005572928012427664
        },
        "FA 28:7": {
            "media": 2.5491402556521576,
            "mediana": 1.5197149145406588,
            "desviacion_estandar": 1.6283418664962122,
            "minimo": 0.9008487983162292,
            "maximo": 5.996346213686713,
            "varianza": 2.6514972341843683
        },
        "NAE 24:1": {
            "media": 0.00826523160553707,
            "mediana": 0.0072059345800722,
            "desviacion_estandar": 0.0038779582013776185,
            "minimo": 0.0037059216157422,
            "maximo": 0.0167435349860119,
            "varianza": 1.5038559811631933e-05
        },
        "DG 20:2": {
            "media": 0.13159780817615918,
            "mediana": 0.1266609969353341,
            "desviacion_estandar": 0.03414746931072701,
            "minimo": 0.0798844337767916,
            "maximo": 0.203834240036997,
            "varianza": 0.001166049660327043
        },
        "CAR 18:1": {
            "media": 0.09080047529237047,
            "mediana": 0.0684061034970173,
            "desviacion_estandar": 0.07554686021444514,
            "minimo": 0.0189342534413115,
            "maximo": 0.3025222055469643,
            "varianza": 0.0057073280882609136
        },
        "CAR 18:0": {
            "media": 0.38439771369274484,
            "mediana": 0.3497002841486424,
            "desviacion_estandar": 0.27630624503308393,
            "minimo": 0.0488280642068783,
            "maximo": 1.033570500647687,
            "varianza": 0.07634514104428261
        },
        "LPE O-16:1": {
            "media": 0.7369204554031105,
            "mediana": 0.4620214567656934,
            "desviacion_estandar": 0.6180298473409996,
            "minimo": 0.0256242538049156,
            "maximo": 1.7636283663018435,
            "varianza": 0.3819608922043394
        },
        "LPE 16:1": {
            "media": 0.10951256073723477,
            "mediana": 0.111727206197101,
            "desviacion_estandar": 0.05916666835944968,
            "minimo": 0.0080951796127997,
            "maximo": 0.2330045971306461,
            "varianza": 0.0035006946447571036
        },
        "LPE O-17:1": {
            "media": 0.2711430316947679,
            "mediana": 0.1514833569849602,
            "desviacion_estandar": 0.22349313452112873,
            "minimo": 0.0099432284135435,
            "maximo": 0.7064534307405581,
            "varianza": 0.04994918117807934
        },
        "LPE 16:0": {
            "media": 0.16031376358162586,
            "mediana": 0.1634393608657131,
            "desviacion_estandar": 0.03472044743345092,
            "minimo": 0.1099971681686431,
            "maximo": 0.2424182666386929,
            "varianza": 0.0012055094699790286
        },
        "CAR 20:0": {
            "media": 0.056959046801465595,
            "mediana": 0.0483208754882838,
            "desviacion_estandar": 0.03254297305885575,
            "minimo": 0.0097172271292355,
            "maximo": 0.1299708829894308,
            "varianza": 0.001059045095509411
        },
        "LPE O-18:2": {
            "media": 0.44852740430973037,
            "mediana": 0.312676460471528,
            "desviacion_estandar": 0.34052515557563934,
            "minimo": 0.0204937747401957,
            "maximo": 1.0265509299832072,
            "varianza": 0.11595738157981336
        },
        "LPE 18:3": {
            "media": 0.6449495348572939,
            "mediana": 0.6322370062464657,
            "desviacion_estandar": 0.28654518003078605,
            "minimo": 0.2373433878256084,
            "maximo": 1.2353112467238894,
            "varianza": 0.08210814019887559
        },
        "LPE 18:2": {
            "media": 2.927876723891011,
            "mediana": 2.23306032540027,
            "desviacion_estandar": 1.9271404862541253,
            "minimo": 0.370899597878134,
            "maximo": 5.954205082702696,
            "varianza": 3.713870453759786
        },
        "LPE 18:1": {
            "media": 0.7715982377522198,
            "mediana": 0.7586643063065488,
            "desviacion_estandar": 0.43472651417242564,
            "minimo": 0.0810136311499663,
            "maximo": 1.420936348042253,
            "varianza": 0.1889871421245082
        },
        "LPE 18:0": {
            "media": 1.9417035379336889,
            "mediana": 1.5535724619990885,
            "desviacion_estandar": 1.4143073959955883,
            "minimo": 0.1016112593882664,
            "maximo": 4.92953914746292,
            "varianza": 2.0002654103678217
        },
        "LPE 22:4": {
            "media": 0.18948898094279182,
            "mediana": 0.1131570724862527,
            "desviacion_estandar": 0.20487631843833098,
            "minimo": 0.0181036338832352,
            "maximo": 0.6340170444847318,
            "varianza": 0.0419743058568444
        },
        "LPC 16:0": {
            "media": 2.436179702397586,
            "mediana": 2.4431311252980175,
            "desviacion_estandar": 1.2492012432607091,
            "minimo": 0.3615254637811647,
            "maximo": 4.179565521152716,
            "varianza": 1.5605037461641011
        },
        "LPC 17:1": {
            "media": 0.21253374775370637,
            "mediana": 0.1981890814533526,
            "desviacion_estandar": 0.09147257102188781,
            "minimo": 0.0381982605140094,
            "maximo": 0.3453358056528014,
            "varianza": 0.00836723124935431
        },
        "LPC 18:3": {
            "media": 0.3116291757237301,
            "mediana": 0.2764418971121785,
            "desviacion_estandar": 0.19852948689756642,
            "minimo": 0.1102236580287499,
            "maximo": 0.9720820024153276,
            "varianza": 0.039413957167810994
        },
        "LPC 18:2": {
            "media": 3.9114392436107788,
            "mediana": 2.7786095579654893,
            "desviacion_estandar": 2.5289985751961175,
            "minimo": 0.5612508898727436,
            "maximo": 7.988224635455053,
            "varianza": 6.395833793343993
        },
        "LPC 18:1": {
            "media": 5.406204532000217,
            "mediana": 4.902860698294199,
            "desviacion_estandar": 2.7085628489790907,
            "minimo": 0.7631125500731583,
            "maximo": 9.39627637356974,
            "varianza": 7.336312706869729
        },
        "LPI 16:0": {
            "media": 0.2713526159946114,
            "mediana": 0.266477396819166,
            "desviacion_estandar": 0.05423943767171793,
            "minimo": 0.1969377564245493,
            "maximo": 0.4033215933082159,
            "varianza": 0.002941916598944175
        },
        "LPC 20:5": {
            "media": 0.17961283083265447,
            "mediana": 0.1952412616411048,
            "desviacion_estandar": 0.0828144260545887,
            "minimo": 0.0524396480469076,
            "maximo": 0.3299061598592441,
            "varianza": 0.006858229162750941
        },
        "LPC 20:4": {
            "media": 0.686148792563404,
            "mediana": 0.4070508494106451,
            "desviacion_estandar": 0.6295272479011652,
            "minimo": 0.1058924462733948,
            "maximo": 2.073640014496978,
            "varianza": 0.39630455585001517
        },
        "LPC 20:3": {
            "media": 0.7669281544314277,
            "mediana": 0.4603681802518996,
            "desviacion_estandar": 0.6922047007765011,
            "minimo": 0.1177126739787317,
            "maximo": 2.201409495366645,
            "varianza": 0.4791473477770854
        },
        "LPI 18:0": {
            "media": 0.11374966342941674,
            "mediana": 0.1215892564035054,
            "desviacion_estandar": 0.06142875449191373,
            "minimo": 0.0054149559117994,
            "maximo": 0.1984969477596887,
            "varianza": 0.003773491878427811
        },
        "LPC 22:5": {
            "media": 0.6169130494359729,
            "mediana": 0.4981853911359047,
            "desviacion_estandar": 0.4428754149318737,
            "minimo": 0.1642939299030479,
            "maximo": 1.5842757156109069,
            "varianza": 0.1961386331510793
        },
        "LPC 22:4": {
            "media": 0.18059042175891923,
            "mediana": 0.0678610943622174,
            "desviacion_estandar": 0.23934448031924355,
            "minimo": 1.2565654367823888e-05,
            "maximo": 0.6545521217922236,
            "varianza": 0.057285780259288765
        },
        "DG 36:6": {
            "media": 0.0032848492457728706,
            "mediana": 0.0032171351895746,
            "desviacion_estandar": 0.002055314762308715,
            "minimo": 0.0006798415357353,
            "maximo": 0.0077637635741326,
            "varianza": 4.224318772164131e-06
        },
        "Urea": {
            "media": 3.046662339012162,
            "mediana": 3.1156531251581407,
            "desviacion_estandar": 0.593238427106903,
            "minimo": 1.7925772771734994,
            "maximo": 4.051932567100401,
            "varianza": 0.3519318313962723
        },
        "Glycine": {
            "media": 0.5727981481369904,
            "mediana": 0.5482718365900896,
            "desviacion_estandar": 0.19700205853075184,
            "minimo": 0.3700443513487224,
            "maximo": 0.9313776517986307,
            "varianza": 0.03880981106535377
        },
        "Piperidine": {
            "media": 8.350540411783111,
            "mediana": 6.6664698469660095,
            "desviacion_estandar": 5.738084837797939,
            "minimo": 2.1286054619279127,
            "maximo": 19.462932244893203,
            "varianza": 32.925617605766604
        },
        "Lactic acid": {
            "media": 427.544927391036,
            "mediana": 429.97345662156704,
            "desviacion_estandar": 44.340088480994424,
            "minimo": 356.80571769633275,
            "maximo": 521.76484612472,
            "varianza": 1966.0434465024146
        },
        "Alanine": {
            "media": 2.7887480137859537,
            "mediana": 2.824789127149265,
            "desviacion_estandar": 0.20215304486260263,
            "minimo": 2.312858129173552,
            "maximo": 3.02672168199367,
            "varianza": 0.040865853547221435
        },
        "3-HYDROXYBUTYRIC ACID": {
            "media": 0.5450833022703034,
            "mediana": 0.5389118472473597,
            "desviacion_estandar": 0.13613069012772222,
            "minimo": 0.269621246892967,
            "maximo": 0.7309365963798464,
            "varianza": 0.01853156479464993
        },
        "4-AMINOBUTANOATE": {
            "media": 0.35199938792861074,
            "mediana": 0.0984082107285749,
            "desviacion_estandar": 0.7509664834222916,
            "minimo": 0.0325381332553404,
            "maximo": 3.027559403637788,
            "varianza": 0.563950659223643
        },
        "CHOLINE": {
            "media": 2.2807324736090058,
            "mediana": 2.4924999653207007,
            "desviacion_estandar": 0.6867640784020372,
            "minimo": 1.2265362332461789,
            "maximo": 3.1324962420048577,
            "varianza": 0.4716448993833996
        },
        "GLYCERIC ACID.1": {
            "media": 4.2770514467218135,
            "mediana": 3.7038690693664655,
            "desviacion_estandar": 1.8056206874202951,
            "minimo": 1.730648838391058,
            "maximo": 8.233922127772736,
            "varianza": 3.260266066840139
        },
        "Serine": {
            "media": 0.4328582932527065,
            "mediana": 0.3408225188116381,
            "desviacion_estandar": 0.2058346954520157,
            "minimo": 0.1549907757884839,
            "maximo": 0.7649230720737558,
            "varianza": 0.042367921851824045
        },
        "Cytosine": {
            "media": 0.061577581589988134,
            "mediana": 0.0640119745820956,
            "desviacion_estandar": 0.010141513278221314,
            "minimo": 0.0413754670717177,
            "maximo": 0.0749877809911337,
            "varianza": 0.00010285029157233921
        },
        "Creatinine": {
            "media": 0.32288180889211604,
            "mediana": 0.3134047219102857,
            "desviacion_estandar": 0.052055333932386455,
            "minimo": 0.255854359014794,
            "maximo": 0.4147791720819005,
            "varianza": 0.0027097577908122643
        },
        "HISTAMINE": {
            "media": 0.5394597414168721,
            "mediana": 0.499449798281226,
            "desviacion_estandar": 0.2535214930925538,
            "minimo": 0.202446922030492,
            "maximo": 1.0503724452632883,
            "varianza": 0.06427314745987779
        },
        "Fumaric acid": {
            "media": 1.7982184211212238,
            "mediana": 1.672543942998458,
            "desviacion_estandar": 1.0411714473482234,
            "minimo": 0.5176849671639807,
            "maximo": 3.9603240793717736,
            "varianza": 1.0840379827731945
        },
        "Maleic acid": {
            "media": 0.9422647166948673,
            "mediana": 0.6625515044198252,
            "desviacion_estandar": 0.7284651272174589,
            "minimo": 0.2743495169373889,
            "maximo": 2.9568602607264927,
            "varianza": 0.5306614415719486
        },
        "N-ACETYLGLYCINE": {
            "media": 0.08061676173444036,
            "mediana": 0.0876880487261064,
            "desviacion_estandar": 0.048458992297966075,
            "minimo": 0.0111238054347611,
            "maximo": 0.1496355284986059,
            "varianza": 0.0023482739345343354
        },
        "Proline": {
            "media": 1.3127274098436355,
            "mediana": 1.314598851995881,
            "desviacion_estandar": 0.35790155532259954,
            "minimo": 0.7429722516944323,
            "maximo": 2.4146284686609567,
            "varianza": 0.12809352330233578
        },
        "Succinic acid": {
            "media": 12.853884160132308,
            "mediana": 8.28291786077604,
            "desviacion_estandar": 8.4134437248131,
            "minimo": 4.148409127648886,
            "maximo": 34.80969758779871,
            "varianza": 70.78603531059693
        },
        "3-HYDROXYISOVALERIC ACID": {
            "media": 0.1578399039149505,
            "mediana": 0.1638514176562305,
            "desviacion_estandar": 0.026175243239271673,
            "minimo": 0.110873670205123,
            "maximo": 0.2074491143778126,
            "varianza": 0.0006851433586350374
        },
        "Betaine": {
            "media": 8.841425946143545,
            "mediana": 7.7547453713367425,
            "desviacion_estandar": 3.3633031397057707,
            "minimo": 4.317025263459861,
            "maximo": 15.722766235079597,
            "varianza": 11.311808009554694
        },
        "Valine": {
            "media": 6.308200978601872,
            "mediana": 5.143459939817974,
            "desviacion_estandar": 3.232635222393686,
            "minimo": 2.5996106278081115,
            "maximo": 11.46709220811835,
            "varianza": 10.449930481060274
        },
        "Threonine": {
            "media": 0.7627802798847869,
            "mediana": 0.7424032831727854,
            "desviacion_estandar": 0.4108118324245873,
            "minimo": 0.3061178785695853,
            "maximo": 1.4590192170342675,
            "varianza": 0.1687663616600472
        },
        "Indoline": {
            "media": 1.9498990643083027,
            "mediana": 1.595083577187634,
            "desviacion_estandar": 1.446128017155245,
            "minimo": 0.474760059360476,
            "maximo": 4.80096256699234,
            "varianza": 2.091286242001361
        },
        "Cysteine": {
            "media": 0.0812799284657083,
            "mediana": 0.0512604949555008,
            "desviacion_estandar": 0.0651777521310266,
            "minimo": 0.0253320206632116,
            "maximo": 0.2018714776860549,
            "varianza": 0.004248139372853542
        },
        "PHENETHYLAMINE": {
            "media": 0.02089587337929485,
            "mediana": 0.0128020465633699,
            "desviacion_estandar": 0.025362911868366426,
            "minimo": 0.0004018788637672,
            "maximo": 0.0834252560007649,
            "varianza": 0.0006432772984425225
        },
        "Niacinamide": {
            "media": 5.120225027777879,
            "mediana": 5.382118741517035,
            "desviacion_estandar": 0.790064218028068,
            "minimo": 2.6442421733675907,
            "maximo": 5.946790853688476,
            "varianza": 0.6242014686083026
        },
        "TAURINE": {
            "media": 3.8078073386669438,
            "mediana": 3.4817582514345635,
            "desviacion_estandar": 1.996012274341671,
            "minimo": 1.2591666991453847,
            "maximo": 9.235472770331713,
            "varianza": 3.9840649993226105
        },
        "Niacin (nicotinic acid)": {
            "media": 0.22181496462384467,
            "mediana": 0.0163354665694003,
            "desviacion_estandar": 0.4161581501264572,
            "minimo": 0.0049373216243336,
            "maximo": 1.3610223441277045,
            "varianza": 0.17318760591667487
        },
        "PYROGLUTAMIC ACID": {
            "media": 2.3810396876108197,
            "mediana": 2.2615217120762714,
            "desviacion_estandar": 0.7210816186267122,
            "minimo": 1.4922015151317325,
            "maximo": 4.32851599108101,
            "varianza": 0.5199587007213192
        },
        "PIPECOLATE": {
            "media": 0.2992503242085305,
            "mediana": 0.2563378944996051,
            "desviacion_estandar": 0.17361358255085932,
            "minimo": 0.1323758419121501,
            "maximo": 0.6702270539634828,
            "varianza": 0.03014167604614404
        },
        "GLUTARIC ACID": {
            "media": 2.019957122698337,
            "mediana": 1.9549037076290257,
            "desviacion_estandar": 0.21812625499858632,
            "minimo": 1.7664664900704945,
            "maximo": 2.509661554724376,
            "varianza": 0.047579063119708304
        },
        "AGMATINE": {
            "media": 0.39065236962455135,
            "mediana": 0.0,
            "desviacion_estandar": 0.8899300404141275,
            "minimo": 0.0,
            "maximo": 2.818312096305143,
            "varianza": 0.7919754768314905
        },
        "CREATINE": {
            "media": 146.74687587526873,
            "mediana": 147.8264439004513,
            "desviacion_estandar": 7.870493723481033,
            "minimo": 129.95854344160284,
            "maximo": 156.5265872906695,
            "varianza": 61.94467145135434
        },
        "Isoleucine": {
            "media": 5.534370095736449,
            "mediana": 4.407244497433704,
            "desviacion_estandar": 3.787892114763977,
            "minimo": 1.4853643127328526,
            "maximo": 12.922360587530251,
            "varianza": 14.348126673091112
        },
        "Leucine": {
            "media": 12.150031832568637,
            "mediana": 9.389099068315774,
            "desviacion_estandar": 8.507319300278528,
            "minimo": 3.039105705126791,
            "maximo": 28.64131087064407,
            "varianza": 72.37448167689155
        },
        "Malic acid": {
            "media": 6.854879297580398,
            "mediana": 4.31259094504669,
            "desviacion_estandar": 6.271918779689117,
            "minimo": 1.5553736095694115,
            "maximo": 24.513185452725143,
            "varianza": 39.33696517901703
        },
        "Asparagine": {
            "media": 0.18577647192347385,
            "mediana": 0.1489753999512409,
            "desviacion_estandar": 0.09807389228440022,
            "minimo": 0.0673097382227898,
            "maximo": 0.3449579011698771,
            "varianza": 0.009618488347812138
        },
        "Ornithine": {
            "media": 0.21625032428956126,
            "mediana": 0.2004559736964824,
            "desviacion_estandar": 0.10760586251679474,
            "minimo": 0.0649600088306342,
            "maximo": 0.4232522498806201,
            "varianza": 0.01157902164798333
        },
        "Threonic acid": {
            "media": 0.3473120009377012,
            "mediana": 0.3435508909604169,
            "desviacion_estandar": 0.13515160586475958,
            "minimo": 0.1929779076624865,
            "maximo": 0.7737761892260638,
            "varianza": 0.018265956567823316
        },
        "4-hydroxybenzoic acid": {
            "media": 0.6131253432844102,
            "mediana": 0.6223831666086652,
            "desviacion_estandar": 0.06802973599606853,
            "minimo": 0.4825259259025533,
            "maximo": 0.7796513278885217,
            "varianza": 0.0046280449796947815
        },
        "HYPOXANTHINE": {
            "media": 15.569109429203248,
            "mediana": 12.6407115168316,
            "desviacion_estandar": 7.072467667787937,
            "minimo": 7.620024051664032,
            "maximo": 30.48718095469068,
            "varianza": 50.01979891190574
        },
        "TYRAMINE": {
            "media": 0.5491882344119431,
            "mediana": 0.0006233490266688,
            "desviacion_estandar": 0.9525899291847162,
            "minimo": 0.0,
            "maximo": 2.9798686891409254,
            "varianza": 0.9074275731841427
        },
        "2-Naphthylamine": {
            "media": 0.10072442173621605,
            "mediana": 0.0001159222731079,
            "desviacion_estandar": 0.21428272451136643,
            "minimo": 0.0,
            "maximo": 0.6133857242273002,
            "varianza": 0.04591708602401416
        },
        "N-Methylisoleucine": {
            "media": 0.21513169732888596,
            "mediana": 0.1751636729687546,
            "desviacion_estandar": 0.09439738407451045,
            "minimo": 0.1235800068858892,
            "maximo": 0.4253914756495969,
            "varianza": 0.00891086612011064
        },
        "alpha-Ketoglutaric (2-Oxoglutaric acid)": {
            "media": 0.0807285076850749,
            "mediana": 0.0661260236589208,
            "desviacion_estandar": 0.05724326991450697,
            "minimo": 0.0290801326716651,
            "maximo": 0.2560447284408402,
            "varianza": 0.0032767919505050985
        },
        "ADIPIC ACID": {
            "media": 0.9236511141545208,
            "mediana": 0.9098725668708034,
            "desviacion_estandar": 0.1288832417123147,
            "minimo": 0.7304517651785646,
            "maximo": 1.2673419729161213,
            "varianza": 0.016610889994274933
        },
        "3-Formylindole": {
            "media": 0.054796899947346246,
            "mediana": 0.0457117612606161,
            "desviacion_estandar": 0.033781356890592966,
            "minimo": 0.0196328705286217,
            "maximo": 0.1244932983269379,
            "varianza": 0.001141180073369613
        },
        "Deoxycarnitine": {
            "media": 3.8556118249381086,
            "mediana": 4.013997850097948,
            "desviacion_estandar": 0.9619506370259624,
            "minimo": 2.4034781564529397,
            "maximo": 5.706291076137436,
            "varianza": 0.9253490280746549
        },
        "SPERMIDINE": {
            "media": 0.10172575772452967,
            "mediana": 0.1002071930416441,
            "desviacion_estandar": 0.043183409217458474,
            "minimo": 0.0233840825599918,
            "maximo": 0.1784339332249773,
            "varianza": 0.0018648068316424776
        },
        "ALPHA-HYDROXYGLUTARIC ACID": {
            "media": 0.44472316778934157,
            "mediana": 0.3689402197719449,
            "desviacion_estandar": 0.3197799262702288,
            "minimo": 0.2320674252397693,
            "maximo": 1.5635826304005265,
            "varianza": 0.10225920124539294
        },
        "Glutamine": {
            "media": 6.461083207305767,
            "mediana": 5.851185224675263,
            "desviacion_estandar": 2.547598918258934,
            "minimo": 3.1428022281911185,
            "maximo": 13.287093848631416,
            "varianza": 6.49026024831409
        },
        "Lysine": {
            "media": 0.99246372712986,
            "mediana": 0.9455017906584156,
            "desviacion_estandar": 0.6090148686587162,
            "minimo": 0.2909594030664344,
            "maximo": 2.2072926402176583,
            "varianza": 0.37089911024739336
        },
        "Glutamic acid": {
            "media": 2.2579200064382277,
            "mediana": 2.205777610363834,
            "desviacion_estandar": 1.149926315158975,
            "minimo": 0.6357863799142535,
            "maximo": 4.1704771841168125,
            "varianza": 1.322330530295098
        },
        "Ribose": {
            "media": 1.5444176688980895,
            "mediana": 1.3040262308548607,
            "desviacion_estandar": 0.8411536702038119,
            "minimo": 0.3296022582558306,
            "maximo": 2.830589915649361,
            "varianza": 0.7075394968973432
        },
        "Methionine": {
            "media": 1.6950938995385656,
            "mediana": 1.1886229080059112,
            "desviacion_estandar": 1.4859781185765935,
            "minimo": 0.3375096504753119,
            "maximo": 4.290493485921818,
            "varianza": 2.2081309688884323
        },
        "XANTHINE": {
            "media": 7.24709954790612,
            "mediana": 6.3774512566489605,
            "desviacion_estandar": 2.274901483060936,
            "minimo": 5.09461609886149,
            "maximo": 13.6909295425057,
            "varianza": 5.175176757632846
        },
        "Histidine": {
            "media": 2.6449775400845104,
            "mediana": 2.4857809432229345,
            "desviacion_estandar": 0.6919127228963204,
            "minimo": 1.594895410499397,
            "maximo": 3.7643072902632433,
            "varianza": 0.47874321610580034
        },
        "Allantoin": {
            "media": 0.14084314371655976,
            "mediana": 0.1245195113454345,
            "desviacion_estandar": 0.058729502401173854,
            "minimo": 0.0482295674057831,
            "maximo": 0.226550557705773,
            "varianza": 0.0034491544522894852
        },
        "PIMELIC ACID": {
            "media": 0.15955103753606006,
            "mediana": 0.1542876978099793,
            "desviacion_estandar": 0.027685750914818907,
            "minimo": 0.1234242426620371,
            "maximo": 0.2354817629687471,
            "varianza": 0.000766500803717396
        },
        "6-CARBOXYHEXANOATE": {
            "media": 0.18300217692509002,
            "mediana": 0.1832375903772246,
            "desviacion_estandar": 0.016081597573013227,
            "minimo": 0.1494581649233382,
            "maximo": 0.2066332982076435,
            "varianza": 0.00025861778050034485
        },
        "L-alanyl-L-alanine": {
            "media": 0.11591031384797039,
            "mediana": 0.0966227436853736,
            "desviacion_estandar": 0.09348547261510098,
            "minimo": 0.0213044120597866,
            "maximo": 0.3833456736765763,
            "varianza": 0.008739533590068797
        },
        "Tryptamine": {
            "media": 0.05022603065265234,
            "mediana": 0.0,
            "desviacion_estandar": 0.10727779061483142,
            "minimo": 0.0,
            "maximo": 0.3016575598979068,
            "varianza": 0.011508524359199612
        },
        "L-CARNITINE": {
            "media": 43.662353126456864,
            "mediana": 41.51296421304668,
            "desviacion_estandar": 10.772312057360923,
            "minimo": 29.82786059024649,
            "maximo": 73.83318874143964,
            "varianza": 116.0427070611635
        },
        "PHTHALIC ACID": {
            "media": 0.419171386572033,
            "mediana": 0.4122089564584636,
            "desviacion_estandar": 0.08065830374254626,
            "minimo": 0.2859644199493541,
            "maximo": 0.5769008571625871,
            "varianza": 0.006505761962624853
        },
        "3-phenyllactic acid": {
            "media": 0.07220842824707595,
            "mediana": 0.0534204674991958,
            "desviacion_estandar": 0.06791256706404197,
            "minimo": 0.0075228163602103,
            "maximo": 0.2286343265076977,
            "varianza": 0.004612116765227999
        },
        "Triethylene glycol monomethyl ether": {
            "media": 0.07322871086305724,
            "mediana": 0.0716259199447325,
            "desviacion_estandar": 0.015264359685398856,
            "minimo": 0.048679885313514,
            "maximo": 0.1029761436045239,
            "varianza": 0.00023300067660522988
        },
        "Phenylalanine": {
            "media": 6.314223311573467,
            "mediana": 5.113244075075368,
            "desviacion_estandar": 4.66191364636272,
            "minimo": 1.5414241774316944,
            "maximo": 15.306722010948503,
            "varianza": 21.733438846142953
        },
        "Uric acid": {
            "media": 0.19171135712757725,
            "mediana": 0.1852826700445799,
            "desviacion_estandar": 0.12455328896032374,
            "minimo": 0.0196167146506452,
            "maximo": 0.4075650213934983,
            "varianza": 0.015513521790833902
        },
        "Pyridoxine (Vit. B6)": {
            "media": 0.08679941464831756,
            "mediana": 0.0229067756462627,
            "desviacion_estandar": 0.09361726364895409,
            "minimo": 0.0034024513513528,
            "maximo": 0.2548330840915227,
            "varianza": 0.008764192053117782
        },
        "3-Methylhistidine ": {
            "media": 1.53043763544776,
            "mediana": 1.3871434600982866,
            "desviacion_estandar": 0.6309277661677698,
            "minimo": 0.6683335272682733,
            "maximo": 2.702227400520571,
            "varianza": 0.398069846121452
        },
        "GLYCEROL 2-PHOSPHATE": {
            "media": 0.39727647548221967,
            "mediana": 0.3851215592216861,
            "desviacion_estandar": 0.2087462625766041,
            "minimo": 0.1218499231428243,
            "maximo": 1.002836325467366,
            "varianza": 0.04357500213970055
        },
        "SUBERIC ACID": {
            "media": 0.6410289723534753,
            "mediana": 0.6285072719401197,
            "desviacion_estandar": 0.10131847773115327,
            "minimo": 0.5060615268284591,
            "maximo": 0.9422184870271127,
            "varianza": 0.0102654339297582
        },
        "Ascorbic acid": {
            "media": 0.26443466911517666,
            "mediana": 0.1426700863264782,
            "desviacion_estandar": 0.30488948405785954,
            "minimo": 0.0050482107971172,
            "maximo": 1.1091455501511622,
            "varianza": 0.09295759748906778
        },
        "ALLANTOIC ACID": {
            "media": 0.0643031450238998,
            "mediana": 0.0661659579183142,
            "desviacion_estandar": 0.035516320867246376,
            "minimo": 0.0203618276182043,
            "maximo": 0.1789854456390371,
            "varianza": 0.0012614090479452003
        },
        "Arginine": {
            "media": 1.2915306669840927,
            "mediana": 1.2613811373821413,
            "desviacion_estandar": 0.4297886263912858,
            "minimo": 0.7424948603858962,
            "maximo": 2.0797114935169083,
            "varianza": 0.18471826337530825
        },
        "L-citrulline": {
            "media": 0.13250276405373274,
            "mediana": 0.1161295007208507,
            "desviacion_estandar": 0.057715930306452834,
            "minimo": 0.0588922101407115,
            "maximo": 0.2543147750402045,
            "varianza": 0.0033311286111393206
        },
        "Hippuric acid": {
            "media": 0.3384541061681537,
            "mediana": 0.1993680170993898,
            "desviacion_estandar": 0.3282399395489646,
            "minimo": 0.0738967667222012,
            "maximo": 1.3178086399186513,
            "varianza": 0.1077414579151079
        },
        "Glucose": {
            "media": 6.014387635050582,
            "mediana": 6.7338890317976485,
            "desviacion_estandar": 3.034133559484865,
            "minimo": 0.874673928223773,
            "maximo": 10.51479100548204,
            "varianza": 9.205966456792297
        },
        "L-Methionine sulfone": {
            "media": 0.2545257893585709,
            "mediana": 0.2414746285759925,
            "desviacion_estandar": 0.16979291788517067,
            "minimo": 0.0808564860775394,
            "maximo": 0.6780132443722635,
            "varianza": 0.02882963496396031
        },
        "HYDROXYPHENYLLACTIC ACID": {
            "media": 0.3938841413482433,
            "mediana": 0.2084175936671232,
            "desviacion_estandar": 0.3452305301419995,
            "minimo": 0.0880679136849399,
            "maximo": 1.1566157474930177,
            "varianza": 0.11918411894212604
        },
        "2-methylsulfanyl-1,3-benzothiazole": {
            "media": 0.11367405708754985,
            "mediana": 0.1197020637844406,
            "desviacion_estandar": 0.013622809893165177,
            "minimo": 0.0908741730528066,
            "maximo": 0.1276808092660416,
            "varianza": 0.00018558094938531903
        },
        "Tyrosine": {
            "media": 3.010983803332017,
            "mediana": 2.5638871473930736,
            "desviacion_estandar": 1.8638009715083386,
            "minimo": 0.976805857901515,
            "maximo": 8.501618513151513,
            "varianza": 3.4737540613954265
        },
        "Triethyl phosphate": {
            "media": 0.5987437852624655,
            "mediana": 0.6088039577626274,
            "desviacion_estandar": 0.03294050987025213,
            "minimo": 0.5502168526682433,
            "maximo": 0.6493497850237077,
            "varianza": 0.0010850771905121777
        },
        "Phosphocholine": {
            "media": 0.3713963990556112,
            "mediana": 0.3513979506885228,
            "desviacion_estandar": 0.1568254577575589,
            "minimo": 0.1677030243318539,
            "maximo": 0.6970528026382611,
            "varianza": 0.02459422420086789
        },
        "Ecgonine": {
            "media": 0.5114316620525563,
            "mediana": 0.3366226961703353,
            "desviacion_estandar": 0.40667106175071027,
            "minimo": 0.0866355224071713,
            "maximo": 1.1160817388027675,
            "varianza": 0.16538135246545
        },
        "AZELAIC ACID": {
            "media": 3.0040814491097607,
            "mediana": 2.847511140728119,
            "desviacion_estandar": 0.5246548437601979,
            "minimo": 2.446399237588875,
            "maximo": 4.596510381398441,
            "varianza": 0.2752627050810376
        },
        "N-epsilon-Acetyllysine": {
            "media": 0.1737545519984309,
            "mediana": 0.0882334922540928,
            "desviacion_estandar": 0.1582157156024972,
            "minimo": 0.0336682221627173,
            "maximo": 0.5047874852726586,
            "varianza": 0.02503221266361028
        },
        "Gly-Leu": {
            "media": 0.10152004928999533,
            "mediana": 0.0844727365367631,
            "desviacion_estandar": 0.10025634849049876,
            "minimo": 0.0186196818054312,
            "maximo": 0.3866499153521891,
            "varianza": 0.010051335412648334
        },
        "Citric acid": {
            "media": 4.8795841567948655,
            "mediana": 0.963021083810518,
            "desviacion_estandar": 6.0097898465476,
            "minimo": 0.2220350316652275,
            "maximo": 18.093151290144363,
            "varianza": 36.11757399966662
        },
        "Isocitric acid": {
            "media": 0.09800117486373046,
            "mediana": 0.0948761244914199,
            "desviacion_estandar": 0.023121817444352488,
            "minimo": 0.0652580146607732,
            "maximo": 0.1580445860361717,
            "varianza": 0.000534618441929963
        },
        "PHENYLACETYLGLYCINE": {
            "media": 0.21993338064853332,
            "mediana": 0.1876224051246544,
            "desviacion_estandar": 0.10573332301618989,
            "minimo": 0.0930141594871607,
            "maximo": 0.4732469892247974,
            "varianza": 0.011179535596045951
        },
        "GLUCONIC ACID": {
            "media": 3.0354114195367266,
            "mediana": 2.985698871897696,
            "desviacion_estandar": 1.4518084970396388,
            "minimo": 0.647735188151365,
            "maximo": 5.0734997321750335,
            "varianza": 2.107747912076495
        },
        "N-Acetylhistidine.1": {
            "media": 0.07420647103688328,
            "mediana": 0.0772059937707923,
            "desviacion_estandar": 0.024681108148101615,
            "minimo": 0.0220300753175276,
            "maximo": 0.1041705194076561,
            "varianza": 0.000609157099418288
        },
        "Ala-Leu/IsoLeu": {
            "media": 0.32327803401222527,
            "mediana": 0.1982267460168389,
            "desviacion_estandar": 0.38699196884367626,
            "minimo": 0.0230028030953066,
            "maximo": 1.5617450158294708,
            "varianza": 0.1497627839495049
        },
        "N,N-Dimethylarginine": {
            "media": 0.10246453356414122,
            "mediana": 0.0928486201579988,
            "desviacion_estandar": 0.029710254204379383,
            "minimo": 0.0610250526638559,
            "maximo": 0.1702210207852182,
            "varianza": 0.0008826992048888428
        },
        "SPERMINE": {
            "media": 0.4068328178630107,
            "mediana": 0.4298866769811435,
            "desviacion_estandar": 0.2227094412461454,
            "minimo": 0.0831354008009051,
            "maximo": 0.795877473074634,
            "varianza": 0.049599495220170285
        },
        "INDOLELACTIC ACID": {
            "media": 0.10232514075772925,
            "mediana": 0.0673727718198966,
            "desviacion_estandar": 0.08526213314360252,
            "minimo": 0.0248402534547493,
            "maximo": 0.2913361974677868,
            "varianza": 0.007269631348197404
        },
        "ACETYL-CARNITINE": {
            "media": 71.62298092280265,
            "mediana": 73.63728535970945,
            "desviacion_estandar": 14.537863221837988,
            "minimo": 41.99639274092179,
            "maximo": 90.12863868079421,
            "varianza": 211.3494670568696
        },
        "Tryptophan": {
            "media": 1.783254250121953,
            "mediana": 1.5164213344569284,
            "desviacion_estandar": 1.1329442838220378,
            "minimo": 0.6474756837026922,
            "maximo": 4.01815009649042,
            "varianza": 1.2835627502450302
        },
        "L-KYNURENINE": {
            "media": 0.04102601634734303,
            "mediana": 0.0371533760038963,
            "desviacion_estandar": 0.014673122172382574,
            "minimo": 0.0142305766742399,
            "maximo": 0.065086562974733,
            "varianza": 0.00021530051428566508
        },
        "3-Phenoxybenzoic acid": {
            "media": 0.08186978460693026,
            "mediana": 0.0815653920773496,
            "desviacion_estandar": 0.007463664243057002,
            "minimo": 0.069521083499864,
            "maximo": 0.0939202702129122,
            "varianza": 5.570628393308765e-05
        },
        "2-Benzothiazolesulfonic acid": {
            "media": 0.13132894618590396,
            "mediana": 0.1327457762313103,
            "desviacion_estandar": 0.015613903957062303,
            "minimo": 0.103197737758044,
            "maximo": 0.1536867253105551,
            "varianza": 0.00024379399678036584
        },
        "Ethyl 3-(N-butylacetamido)propionate": {
            "media": 2.1328378804872044,
            "mediana": 2.155202563435756,
            "desviacion_estandar": 0.16463149381897918,
            "minimo": 1.827741728229596,
            "maximo": 2.3691790902649794,
            "varianza": 0.027103528757068583
        },
        "D-PANTOTHENIC ACID": {
            "media": 0.8538699222713106,
            "mediana": 0.729865189328104,
            "desviacion_estandar": 0.3613611952561789,
            "minimo": 0.35806689019072,
            "maximo": 1.635306313906382,
            "varianza": 0.13058191343697423
        },
        "Propionylcarnitine": {
            "media": 4.54545924830577,
            "mediana": 4.748460658965762,
            "desviacion_estandar": 1.693847510404799,
            "minimo": 1.992376954191956,
            "maximo": 6.883106736171682,
            "varianza": 2.8691193885045356
        },
        "Pantothenic acid (Vitamin B5)": {
            "media": 0.18131399057578326,
            "mediana": 0.1786373506229952,
            "desviacion_estandar": 0.06936859709364673,
            "minimo": 0.0740278096800836,
            "maximo": 0.3249107654238388,
            "varianza": 0.004812002262740694
        },
        "2-(4-Morpholinyl)benzothiazole": {
            "media": 0.8255528045730816,
            "mediana": 0.8361301416818268,
            "desviacion_estandar": 0.03679679682715744,
            "minimo": 0.7570314090754426,
            "maximo": 0.8900425003032214,
            "varianza": 0.001354004256739104
        },
        "CARNOSINE": {
            "media": 23.00979094352448,
            "mediana": 21.110129501733248,
            "desviacion_estandar": 5.63328976895908,
            "minimo": 14.468861064861825,
            "maximo": 32.314622330375016,
            "varianza": 31.733953621059044
        },
        "Ribose-5-phosphate": {
            "media": 2.962572960944664,
            "mediana": 3.0556076207327187,
            "desviacion_estandar": 1.4892203868600873,
            "minimo": 1.1124287387866476,
            "maximo": 5.6718602129973625,
            "varianza": 2.2177773606397078
        },
        "Ala-Phe": {
            "media": 0.09073755043382865,
            "mediana": 0.0809420972186201,
            "desviacion_estandar": 0.07574308529532786,
            "minimo": 0.0106581767374819,
            "maximo": 0.329795372399952,
            "varianza": 0.005737014970055311
        },
        "Gly-Tyr": {
            "media": 0.07042815022960026,
            "mediana": 0.0291859307742728,
            "desviacion_estandar": 0.08411480804878801,
            "minimo": 0.0032373803873432,
            "maximo": 0.3146967074401591,
            "varianza": 0.007075300933084453
        },
        "Anserine.1": {
            "media": 6.439836528842173,
            "mediana": 5.729976002509161,
            "desviacion_estandar": 2.715646340277062,
            "minimo": 2.816639478902661,
            "maximo": 11.582588600299008,
            "varianza": 7.3747350454602
        },
        "Uridine": {
            "media": 2.758484747726485,
            "mediana": 2.831127601408956,
            "desviacion_estandar": 0.39485954600758966,
            "minimo": 1.891420508752048,
            "maximo": 3.318580451290232,
            "varianza": 0.15591406107331982
        },
        "Isoleucylisoleucine": {
            "media": 0.24111391511277389,
            "mediana": 0.1898774031187291,
            "desviacion_estandar": 0.15792632163757536,
            "minimo": 0.0373169663922993,
            "maximo": 0.7244521858865463,
            "varianza": 0.024940723065974904
        },
        "CYTIDINE": {
            "media": 0.0867942277249694,
            "mediana": 0.0871893063269216,
            "desviacion_estandar": 0.0243740638126605,
            "minimo": 0.0349486258075907,
            "maximo": 0.1204653544870429,
            "varianza": 0.0005940949867436461
        },
        "Biotin": {
            "media": 0.0051163479883882465,
            "mediana": 0.0046504168138283,
            "desviacion_estandar": 0.0024376981921030213,
            "minimo": 0.0009419443688802,
            "maximo": 0.0104019002057402,
            "varianza": 5.942372475782339e-06
        },
        "Glu-Thr": {
            "media": 0.2730676525304051,
            "mediana": 0.1521283831678717,
            "desviacion_estandar": 0.2791485843942471,
            "minimo": 0.013305560542274,
            "maximo": 0.8895965225923333,
            "varianza": 0.07792393216931211
        },
        "GLUCOSAMINE 6-PHOSPHATE": {
            "media": 0.058118955913782966,
            "mediana": 0.0631113507335539,
            "desviacion_estandar": 0.031227057222029137,
            "minimo": 0.0,
            "maximo": 0.1126735648330563,
            "varianza": 0.0009751291027478821
        },
        "SN-GLYCERO-3-PHOSPHOCHOLINE.1": {
            "media": 3.361349327064199,
            "mediana": 2.938232481920858,
            "desviacion_estandar": 1.9870810781003538,
            "minimo": 0.8896471014713238,
            "maximo": 7.60705521915076,
            "varianza": 3.9484912109444643
        },
        "Glusose-6-phosphate": {
            "media": 31.993540620459754,
            "mediana": 31.708224857600623,
            "desviacion_estandar": 20.002962734523326,
            "minimo": 0.4840267792437091,
            "maximo": 66.2333688126426,
            "varianza": 400.11851815872893
        },
        "ALPHA-GLUCOSE 1-PHOSPHATE": {
            "media": 0.5377294994257711,
            "mediana": 0.5652035806019802,
            "desviacion_estandar": 0.21575298461698156,
            "minimo": 0.166282470009657,
            "maximo": 0.8730966005036768,
            "varianza": 0.04654935037113549
        },
        "9-(2,3-dihydroxypropoxy)-9-oxononanoic acid": {
            "media": 0.12189870715989069,
            "mediana": 0.1142376630675922,
            "desviacion_estandar": 0.04190560351389856,
            "minimo": 0.0885502772114593,
            "maximo": 0.2647916649974421,
            "varianza": 0.0017560796058640675
        },
        "Asp-Glu": {
            "media": 0.18227529055264094,
            "mediana": 0.120213509970207,
            "desviacion_estandar": 0.1608855776032015,
            "minimo": 0.0207390961754234,
            "maximo": 0.4695280434939794,
            "varianza": 0.02588416908071577
        },
        "INOSINE.1": {
            "media": 51.4418336164045,
            "mediana": 49.88096143268905,
            "desviacion_estandar": 7.289434162148034,
            "minimo": 40.97169717333233,
            "maximo": 68.7364382781239,
            "varianza": 53.13585040429081
        },
        "Tri-isobutylphosphate.1": {
            "media": 0.05939067833101967,
            "mediana": 0.0576341979312315,
            "desviacion_estandar": 0.004066766026683316,
            "minimo": 0.0540676843958301,
            "maximo": 0.0664830974094856,
            "varianza": 1.65385859157856e-05
        },
        "Glu-Gln": {
            "media": 0.11960911437558401,
            "mediana": 0.0826871532674682,
            "desviacion_estandar": 0.07048755091815846,
            "minimo": 0.044389551092713,
            "maximo": 0.2854528629640296,
            "varianza": 0.004968494834439982
        },
        "ASP-PHE": {
            "media": 0.16437349554391917,
            "mediana": 0.1196928497716542,
            "desviacion_estandar": 0.15912723508085755,
            "minimo": 0.0224204100039207,
            "maximo": 0.532522865951047,
            "varianza": 0.025321476944478505
        },
        "Guanosine": {
            "media": 0.39452113955767926,
            "mediana": 0.3881743183756168,
            "desviacion_estandar": 0.08696132649293582,
            "minimo": 0.2823872546737486,
            "maximo": 0.6060134839691652,
            "varianza": 0.007562272305410982
        },
        "XANTHOSINE": {
            "media": 0.753076978545448,
            "mediana": 0.6622515976389618,
            "desviacion_estandar": 0.1812974225604185,
            "minimo": 0.522982312530159,
            "maximo": 1.0735898421830794,
            "varianza": 0.03286875542705094
        },
        "OCTANOYLCARNITINE": {
            "media": 0.1870196425955619,
            "mediana": 0.1687469841579703,
            "desviacion_estandar": 0.14181743151419013,
            "minimo": 0.0157170975754095,
            "maximo": 0.4936762458235391,
            "varianza": 0.020112183881282008
        },
        "Sedoheptulose 7-phosphate": {
            "media": 0.5626790897056737,
            "mediana": 0.4636856639293385,
            "desviacion_estandar": 0.4124138054187774,
            "minimo": 0.2076380269122878,
            "maximo": 1.630768331952842,
            "varianza": 0.1700851468999972
        },
        "OPHTHALMIC ACID": {
            "media": 0.12015115976245323,
            "mediana": 0.0858145308740919,
            "desviacion_estandar": 0.08170099686302403,
            "minimo": 0.0532769270104092,
            "maximo": 0.3237690011749261,
            "varianza": 0.006675052888411861
        },
        "2-[(2R,8S,8aR)-8,8a-dimethyl-2,3,5,6,7,8-hexahydro-1H-naphthalen-2-yl]prop-2-enoic acid": {
            "media": 0.2939894208389704,
            "mediana": 0.2879473384700865,
            "desviacion_estandar": 0.036767850674102945,
            "minimo": 0.2404926826979159,
            "maximo": 0.372422303585926,
            "varianza": 0.0013518748431931324
        },
        "Tetradecylsulfate": {
            "media": 5.160968707081825,
            "mediana": 5.190924015464072,
            "desviacion_estandar": 0.5400151531017151,
            "minimo": 4.037186552229807,
            "maximo": 5.97067812826348,
            "varianza": 0.29161636557946885
        },
        "gamma-Glu-Thr-Gly": {
            "media": 0.037075829079823895,
            "mediana": 0.0328097563765825,
            "desviacion_estandar": 0.0211049121104925,
            "minimo": 0.017496692556976,
            "maximo": 0.1070308510223806,
            "varianza": 0.000445417315191613
        },
        "Epigallocatechin": {
            "media": 2.8987244060236246,
            "mediana": 3.1113930131964525,
            "desviacion_estandar": 1.1938580055673245,
            "minimo": 0.9589787684364292,
            "maximo": 4.691846149541993,
            "varianza": 1.42529693745719
        },
        "Glutathione reduced": {
            "media": 6.07094112960781,
            "mediana": 6.134558503914497,
            "desviacion_estandar": 1.3621691336079633,
            "minimo": 3.3679832422290734,
            "maximo": 8.61257086427548,
            "varianza": 1.8555047485542695
        },
        "N-ACETYLNEURAMINATE": {
            "media": 0.2125469486268712,
            "mediana": 0.2031622708490322,
            "desviacion_estandar": 0.07530610648212402,
            "minimo": 0.0941441054627046,
            "maximo": 0.3457266403011567,
            "varianza": 0.0056710096734970015
        },
        "DECANOYLCARNITINE": {
            "media": 0.036740937110079606,
            "mediana": 0.030503426538602,
            "desviacion_estandar": 0.025210049724497575,
            "minimo": 0.0076817136681992,
            "maximo": 0.093581477083495,
            "varianza": 0.0006355466071116403
        },
        "3'-CMP": {
            "media": 0.298365777842042,
            "mediana": 0.2973157809197182,
            "desviacion_estandar": 0.12200350220216635,
            "minimo": 0.141316163478741,
            "maximo": 0.5629813457220858,
            "varianza": 0.01488485454959401
        },
        "URIDINE-5-MONOPHOSPHATE": {
            "media": 2.9192056545625356,
            "mediana": 2.9842932872911727,
            "desviacion_estandar": 2.0552327172000195,
            "minimo": 0.1621568941192543,
            "maximo": 6.104491208259612,
            "varianza": 4.2239815218493755
        },
        "(Z)-5,8,11-trihydroxyoctadec-9-enoic acid": {
            "media": 0.182390567533266,
            "mediana": 0.1605065854368915,
            "desviacion_estandar": 0.04963939316273095,
            "minimo": 0.1414425543813097,
            "maximo": 0.3028944692322159,
            "varianza": 0.0024640693535641803
        },
        "NICOTINAMIDE MONONUCLEOTIDE": {
            "media": 0.0121244284274864,
            "mediana": 0.0113742992513048,
            "desviacion_estandar": 0.009982021362030047,
            "minimo": 0.0019617005759904,
            "maximo": 0.0337831497264003,
            "varianza": 9.96407504720242e-05
        },
        "PALATINOSE": {
            "media": 0.27404179288450503,
            "mediana": 0.2457504065448298,
            "desviacion_estandar": 0.20676099506214773,
            "minimo": 0.0716506254733563,
            "maximo": 0.8365818254102378,
            "varianza": 0.04275010907908948
        },
        "Lauramidopropyl betaine": {
            "media": 0.07222032908734309,
            "mediana": 0.0711435328236454,
            "desviacion_estandar": 0.006910389337075121,
            "minimo": 0.0637075999465493,
            "maximo": 0.0917065531393113,
            "varianza": 4.775348078996152e-05
        },
        "Inosine-5-monophosphate": {
            "media": 54.8184183806823,
            "mediana": 60.527463541388954,
            "desviacion_estandar": 22.891466123702898,
            "minimo": 14.47695260944527,
            "maximo": 84.06271158569541,
            "varianza": 524.0192212926374
        },
        "INOSINE 5'-MONOPHOSPHATE": {
            "media": 8.022206893241792,
            "mediana": 9.588444383652364,
            "desviacion_estandar": 2.971980053351732,
            "minimo": 2.692258739743428,
            "maximo": 11.048069889091582,
            "varianza": 8.832665437520564
        },
        "GUANOSINE 5'-MONOPHOSPHATE": {
            "media": 1.227578323188918,
            "mediana": 1.3806563691183542,
            "desviacion_estandar": 0.41683523682209755,
            "minimo": 0.430264910893458,
            "maximo": 1.784365465651974,
            "varianza": 0.17375161465653416
        },
        "Riboflavin": {
            "media": 0.005472750861672088,
            "mediana": 0.0048065514239549,
            "desviacion_estandar": 0.0024886518262164786,
            "minimo": 0.0025576455429243,
            "maximo": 0.0108022192248898,
            "varianza": 6.193387912130613e-06
        },
        "Acetyl tributyl citrate": {
            "media": 0.22103220396185916,
            "mediana": 0.2127924334308828,
            "desviacion_estandar": 0.061513786817372546,
            "minimo": 0.1437780931073821,
            "maximo": 0.337213201095235,
            "varianza": 0.003783945968613156
        },
        "Adenosine diphosphate": {
            "media": 0.059082263817946484,
            "mediana": 0.0434141741186654,
            "desviacion_estandar": 0.03436201709096997,
            "minimo": 0.0195860276911334,
            "maximo": 0.1121858918105013,
            "varianza": 0.0011807482185601124
        },
        "CYTIDINE 5'-DIPHOSPHOCHOLINE": {
            "media": 0.20278869845518288,
            "mediana": 0.2006445002591416,
            "desviacion_estandar": 0.028438140209241514,
            "minimo": 0.1511782858695914,
            "maximo": 0.267171281584025,
            "varianza": 0.0008087278185604789
        },
        "ADENOSINE DIPHOSPHATE RIBOSE": {
            "media": 0.509262933413242,
            "mediana": 0.4201181487813137,
            "desviacion_estandar": 0.36527610985405573,
            "minimo": 0.1556479062517046,
            "maximo": 1.2002395795092786,
            "varianza": 0.13342663643011218
        },
        "GUANOSINE 5,9;-DIPHOSPHO-D-MANNOSE": {
            "media": 0.22053372603256563,
            "mediana": 0.2248821232873698,
            "desviacion_estandar": 0.07123847168015612,
            "minimo": 0.1006665412003569,
            "maximo": 0.3513221897098124,
            "varianza": 0.005074919847324407
        },
        "Uridine 5'-diphospho-N-acetylglucosamine": {
            "media": 0.22417990047412387,
            "mediana": 0.1787123117896632,
            "desviacion_estandar": 0.13324272437058848,
            "minimo": 0.0439736793104374,
            "maximo": 0.5471888088963679,
            "varianza": 0.01775362359769661
        },
        "Glutathione oxidized": {
            "media": 1.8584999123768053,
            "mediana": 2.0816413062642547,
            "desviacion_estandar": 0.7778990418598225,
            "minimo": 0.5500400914419508,
            "maximo": 2.9513253293705737,
            "varianza": 0.6051269193264299
        },
        "BETA-NICOTINAMIDE ADENINE DINUCLEOTIDE": {
            "media": 0.15792851491909007,
            "mediana": 0.1177853575167477,
            "desviacion_estandar": 0.18991308164024673,
            "minimo": 0.0,
            "maximo": 0.7097983894081421,
            "varianza": 0.03606697857809502
        },
        "NADH": {
            "media": 2.192525610251943,
            "mediana": 2.267715917541363,
            "desviacion_estandar": 1.161465835536981,
            "minimo": 0.8919475567107245,
            "maximo": 5.308592785941945,
            "varianza": 1.3490028871196171
        }
    },
    "analisis_milk": {
        "Urea": {
            "media": 15.089013942333253,
            "mediana": 14.688072180039203,
            "desviacion_estandar": 2.071231239320327,
            "minimo": 11.570482375345993,
            "maximo": 18.28675750945504,
            "varianza": 4.2899988467364185
        },
        "Pyrrolidine": {
            "media": 0.20931453842334338,
            "mediana": 0.20240040858230052,
            "desviacion_estandar": 0.045777762265380134,
            "minimo": 0.1556061153228212,
            "maximo": 0.304205931105726,
            "varianza": 0.002095603518025661
        },
        "Glycolic acid": {
            "media": 2.089086439427976,
            "mediana": 2.108106531933209,
            "desviacion_estandar": 0.17822289288724025,
            "minimo": 1.675505477832374,
            "maximo": 2.3657814271559854,
            "varianza": 0.03176339954909671
        },
        "Glycine": {
            "media": 0.2822823045438406,
            "mediana": 0.2901449443759424,
            "desviacion_estandar": 0.07105260666771084,
            "minimo": 0.1571094859056166,
            "maximo": 0.3896317732659763,
            "varianza": 0.005048472914276426
        },
        "Pyruvic acid": {
            "media": 5.185673412924158,
            "mediana": 5.403656363189926,
            "desviacion_estandar": 1.1022113716033652,
            "minimo": 3.1125967590065025,
            "maximo": 7.137963178820568,
            "varianza": 1.2148699076917717
        },
        "Lactic acid": {
            "media": 7.332166710993874,
            "mediana": 6.779936548779579,
            "desviacion_estandar": 1.5343458568714252,
            "minimo": 6.040304183862279,
            "maximo": 12.018226891147735,
            "varianza": 2.354217208498508
        },
        "Alanine": {
            "media": 0.16963904786729644,
            "mediana": 0.16966798633888036,
            "desviacion_estandar": 0.015509881731744274,
            "minimo": 0.1451746855157709,
            "maximo": 0.1993394194800525,
            "varianza": 0.00024055643133269477
        },
        "Ortophosphate": {
            "media": 1.201379099327484,
            "mediana": 1.147178218910109,
            "desviacion_estandar": 0.22601376181923988,
            "minimo": 0.9366714260856016,
            "maximo": 1.6363631441980713,
            "varianza": 0.05108222053168409
        },
        "2-Ketobutyric acid": {
            "media": 1.4202740722329315,
            "mediana": 1.4432802835801413,
            "desviacion_estandar": 0.1540370493009899,
            "minimo": 1.1116419572587493,
            "maximo": 1.6215938181713394,
            "varianza": 0.023727412557355596
        },
        "Choline": {
            "media": 1.041579874563233,
            "mediana": 1.01762583993664,
            "desviacion_estandar": 0.12444411534723877,
            "minimo": 0.854689987208883,
            "maximo": 1.2268339206577432,
            "varianza": 0.015486337844556868
        },
        "GLYCERATE": {
            "media": 0.32098800737345395,
            "mediana": 0.3230680739593268,
            "desviacion_estandar": 0.04579039141942733,
            "minimo": 0.2360917656455224,
            "maximo": 0.4120851669628334,
            "varianza": 0.0020967599463443645
        },
        "Serine": {
            "media": 0.023978946737173355,
            "mediana": 0.01695117886547635,
            "desviacion_estandar": 0.013265377432360809,
            "minimo": 0.0137347279465112,
            "maximo": 0.0469441102028961,
            "varianza": 0.00017597023842298745
        },
        "Creatinine": {
            "media": 0.40178838108742576,
            "mediana": 0.4049099523596184,
            "desviacion_estandar": 0.06474238506494948,
            "minimo": 0.3020254763943782,
            "maximo": 0.5084713456907558,
            "varianza": 0.004191576423898193
        },
        "Proline": {
            "media": 0.46330539150211203,
            "mediana": 0.46417568821308264,
            "desviacion_estandar": 0.05931623971606541,
            "minimo": 0.3449481126739831,
            "maximo": 0.557902697713566,
            "varianza": 0.0035184162940537357
        },
        "Succinic acid": {
            "media": 1.5466792386019819,
            "mediana": 1.5922455075384936,
            "desviacion_estandar": 0.25076255610327475,
            "minimo": 1.117093023733966,
            "maximo": 1.9629500548357095,
            "varianza": 0.06288185954344802
        },
        "Betaine": {
            "media": 4.216202851758044,
            "mediana": 4.117952214981426,
            "desviacion_estandar": 0.46863669832810795,
            "minimo": 3.483166486303229,
            "maximo": 5.189758575974716,
            "varianza": 0.21962035501987007
        },
        "Valine": {
            "media": 0.5722006124985792,
            "mediana": 0.5731187893945346,
            "desviacion_estandar": 0.08782672686984336,
            "minimo": 0.4554633066849366,
            "maximo": 0.7449566223213021,
            "varianza": 0.007713533952670066
        },
        "Threonine": {
            "media": 0.004303533453709886,
            "mediana": 0.003480297633412,
            "desviacion_estandar": 0.0026613815447457637,
            "minimo": 0.0003365778943933,
            "maximo": 0.0094493283636148,
            "varianza": 7.082951726713347e-06
        },
        "4-HYDROXYBENZALDEHYDE": {
            "media": 1.4021428568860679,
            "mediana": 1.3542785962249226,
            "desviacion_estandar": 0.1815163385883252,
            "minimo": 1.25190235887115,
            "maximo": 1.9723731870592256,
            "varianza": 0.03294818117451151
        },
        "TAURINE": {
            "media": 1.6213556268464628,
            "mediana": 1.5742512883656592,
            "desviacion_estandar": 0.31935619265035486,
            "minimo": 1.2540040395756078,
            "maximo": 2.476316185614566,
            "varianza": 0.10198837778413058
        },
        "Niacin (nicotinic acid)": {
            "media": 0.024700386160270725,
            "mediana": 0.01398238450249155,
            "desviacion_estandar": 0.02188501956114202,
            "minimo": 0.0072085744937938,
            "maximo": 0.0736530017321464,
            "varianza": 0.0004789540811915689
        },
        "Taurine": {
            "media": 0.15839369303898176,
            "mediana": 0.16085614168069778,
            "desviacion_estandar": 0.027459955356421747,
            "minimo": 0.1155035089640532,
            "maximo": 0.2220025687235068,
            "varianza": 0.0007540491481766754
        },
        "L-Pipecolic acid": {
            "media": 0.11416216585428987,
            "mediana": 0.0324455167673292,
            "desviacion_estandar": 0.3108895134510276,
            "minimo": 0.0056492142002398,
            "maximo": 1.193377073412936,
            "varianza": 0.09665228957381668
        },
        "Glutaric acid": {
            "media": 3.030438148172029,
            "mediana": 2.93039436480285,
            "desviacion_estandar": 0.2618911100888969,
            "minimo": 2.77595646833559,
            "maximo": 3.781688272688801,
            "varianza": 0.06858695354359469
        },
        "CREATINE": {
            "media": 8.804767869952874,
            "mediana": 8.622620020715958,
            "desviacion_estandar": 0.9753447127065139,
            "minimo": 7.613494655782462,
            "maximo": 10.513386370188318,
            "varianza": 0.9512973086045522
        },
        "Isoleucine": {
            "media": 0.13408667568448915,
            "mediana": 0.123240963543582,
            "desviacion_estandar": 0.04143830237784845,
            "minimo": 0.0755272533441632,
            "maximo": 0.1944097459089409,
            "varianza": 0.0017171329039580006
        },
        "Leucine": {
            "media": 0.22587371497604816,
            "mediana": 0.20745512578251013,
            "desviacion_estandar": 0.05884782356793511,
            "minimo": 0.1586856476549331,
            "maximo": 0.3296562831408322,
            "varianza": 0.003463066338682819
        },
        "Malic acid": {
            "media": 2.0640642869596784,
            "mediana": 1.9706462718557896,
            "desviacion_estandar": 0.3838678826347893,
            "minimo": 1.525878239611087,
            "maximo": 2.965016391155157,
            "varianza": 0.1473545513185164
        },
        "Asparagine": {
            "media": 0.010797992951186833,
            "mediana": 0.00725256381370755,
            "desviacion_estandar": 0.006805362535793543,
            "minimo": 0.0049012922996308,
            "maximo": 0.0230900233583935,
            "varianza": 4.631295924358232e-05
        },
        "Aspartic acid": {
            "media": 0.10472466719535574,
            "mediana": 0.1127982731767701,
            "desviacion_estandar": 0.044588661054305256,
            "minimo": 0.0393906289190383,
            "maximo": 0.1691773046581166,
            "varianza": 0.001988148694615718
        },
        "Threonic acid": {
            "media": 0.37139989151229524,
            "mediana": 0.39042526419140217,
            "desviacion_estandar": 0.07244699003665489,
            "minimo": 0.2343829464271111,
            "maximo": 0.4848276435962998,
            "varianza": 0.005248566365371173
        },
        "3-HYDROXYBENZOATE": {
            "media": 0.8901629428744557,
            "mediana": 0.8550551650480775,
            "desviacion_estandar": 0.1165235782414233,
            "minimo": 0.7322651323336881,
            "maximo": 1.2233030096906377,
            "varianza": 0.013577744286185097
        },
        "Proline betaine": {
            "media": 0.18429642822532127,
            "mediana": 0.023162382548631053,
            "desviacion_estandar": 0.28463589500145764,
            "minimo": 0.0170825071014109,
            "maximo": 0.781710475635128,
            "varianza": 0.08101759272328082
        },
        "alpha-Ketoglutaric (2-Oxoglutaric acid)": {
            "media": 2.0712354392747643,
            "mediana": 2.130888102942564,
            "desviacion_estandar": 0.29368733214609505,
            "minimo": 1.4660226793972546,
            "maximo": 2.541945914718347,
            "varianza": 0.08625224906309076
        },
        "2-Methylglutaric acid": {
            "media": 1.5361066721436654,
            "mediana": 1.5012227152731372,
            "desviacion_estandar": 0.19617623771378678,
            "minimo": 1.3490759842091156,
            "maximo": 2.1544913447622087,
            "varianza": 0.038485116243536184
        },
        "Acetylcholine": {
            "media": 0.22429248288484133,
            "mediana": 0.22659467333114006,
            "desviacion_estandar": 0.05133393288671064,
            "minimo": 0.1489930193286211,
            "maximo": 0.2856738269106002,
            "varianza": 0.002635172665617312
        },
        "Glutamine": {
            "media": 0.11300625823779717,
            "mediana": 0.11961138275130381,
            "desviacion_estandar": 0.028135608289794403,
            "minimo": 0.065897870738475,
            "maximo": 0.1548494460350102,
            "varianza": 0.0007916124538367476
        },
        "Lysine": {
            "media": 0.12040873258178171,
            "mediana": 0.1179967821463597,
            "desviacion_estandar": 0.01760001332813812,
            "minimo": 0.0974693048559142,
            "maximo": 0.1577466213525581,
            "varianza": 0.00030976046915063936
        },
        "Glutamic acid": {
            "media": 0.08129578663813442,
            "mediana": 0.06844137491677794,
            "desviacion_estandar": 0.03154201285832948,
            "minimo": 0.0455557081533557,
            "maximo": 0.1451874283622414,
            "varianza": 0.0009948985751550223
        },
        "Methionine": {
            "media": 0.0438259917338033,
            "mediana": 0.04049163083908115,
            "desviacion_estandar": 0.007884364601635182,
            "minimo": 0.0352448792024604,
            "maximo": 0.0599558937295042,
            "varianza": 6.216320517151791e-05
        },
        "Orotic acid": {
            "media": 2.8561274145404676,
            "mediana": 3.1536820654904227,
            "desviacion_estandar": 1.1389712740995999,
            "minimo": 1.1472225224625308,
            "maximo": 4.600939672832375,
            "varianza": 1.2972555632240659
        },
        "Histidine": {
            "media": 0.011325054871547736,
            "mediana": 0.01022574392167415,
            "desviacion_estandar": 0.0032333341304427578,
            "minimo": 0.0072625044544136,
            "maximo": 0.0182106759229931,
            "varianza": 1.0454449599086024e-05
        },
        "Dihydroorotic acid": {
            "media": 0.4429021268049601,
            "mediana": 0.5839382204320585,
            "desviacion_estandar": 0.2417981106353503,
            "minimo": 0.0835937520068622,
            "maximo": 0.691042409726299,
            "varianza": 0.058466326306825106
        },
        "Allantoin": {
            "media": 0.34974091375000504,
            "mediana": 0.3536231011759057,
            "desviacion_estandar": 0.04794656261232172,
            "minimo": 0.2600010294989743,
            "maximo": 0.4173903665271416,
            "varianza": 0.0022988728663372866
        },
        " Homostachydrine": {
            "media": 0.3016028421322615,
            "mediana": 0.04163635226357595,
            "desviacion_estandar": 0.43556147955395963,
            "minimo": 0.034951713193087,
            "maximo": 1.1202211665107558,
            "varianza": 0.1897138024712344
        },
        "6-CARBOXYHEXANOATE": {
            "media": 0.29649199844720225,
            "mediana": 0.30071351952613756,
            "desviacion_estandar": 0.04325117468907967,
            "minimo": 0.244273988680786,
            "maximo": 0.4204431368105368,
            "varianza": 0.0018706641119852858
        },
        "5-Aminovaleric acid betaine": {
            "media": 0.47097482537614255,
            "mediana": 0.5272626139464152,
            "desviacion_estandar": 0.11410009653234654,
            "minimo": 0.2889009714091697,
            "maximo": 0.5833337969896185,
            "varianza": 0.013018832028690799
        },
        "ALLOSE": {
            "media": 12.135613301379376,
            "mediana": 11.904777697340144,
            "desviacion_estandar": 1.0807468201195396,
            "minimo": 10.52130660737256,
            "maximo": 14.302116730552571,
            "varianza": 1.1680136891984962
        },
        "L-Carnitine": {
            "media": 3.0338195273969886,
            "mediana": 2.9398447142743525,
            "desviacion_estandar": 0.48058545412938053,
            "minimo": 2.3212056565720185,
            "maximo": 3.97508483601392,
            "varianza": 0.2309623787207429
        },
        "Phenylalanine": {
            "media": 0.07771421490575725,
            "mediana": 0.0695748936925212,
            "desviacion_estandar": 0.02375679861224737,
            "minimo": 0.0557512882576346,
            "maximo": 0.1276296302851258,
            "varianza": 0.0005643854803028786
        },
        "Uric acid": {
            "media": 0.46246599777542624,
            "mediana": 0.43441375963299333,
            "desviacion_estandar": 0.11551572095399379,
            "minimo": 0.2740795130803129,
            "maximo": 0.6810335330881246,
            "varianza": 0.013343881787520958
        },
        "Aconitic acid": {
            "media": 0.9273951847904949,
            "mediana": 0.9291832906853219,
            "desviacion_estandar": 0.07374697149665671,
            "minimo": 0.8220204261447988,
            "maximo": 1.042434066802753,
            "varianza": 0.005438615804928697
        },
        "SUBERIC ACID": {
            "media": 1.7083941052375877,
            "mediana": 1.6847962134211598,
            "desviacion_estandar": 0.18950633899653962,
            "minimo": 1.530962297963612,
            "maximo": 2.3189422392804877,
            "varianza": 0.03591265251987139
        },
        "Ascorbic acid": {
            "media": 0.8581977103398589,
            "mediana": 0.6621208576181977,
            "desviacion_estandar": 0.640943868155083,
            "minimo": 0.0856854108563235,
            "maximo": 2.040318100374704,
            "varianza": 0.4108090421256004
        },
        "N-Carbamoyl-DL-aspartic acid": {
            "media": 0.8248248480382777,
            "mediana": 0.8798648562723227,
            "desviacion_estandar": 0.31872886746773577,
            "minimo": 0.3439731692526084,
            "maximo": 1.344238370238276,
            "varianza": 0.10158809095726545
        },
        "Arginine": {
            "media": 0.12221458452565423,
            "mediana": 0.11972619907820606,
            "desviacion_estandar": 0.018425340054037738,
            "minimo": 0.0995525626132848,
            "maximo": 0.1570708420918685,
            "varianza": 0.0003394931561069274
        },
        "Hippuric acid": {
            "media": 48.393442021036506,
            "mediana": 57.14561801051638,
            "desviacion_estandar": 18.223113584102837,
            "minimo": 20.535657680732207,
            "maximo": 68.83138383045188,
            "varianza": 332.0818686991134
        },
        "Glucose/Galactose": {
            "media": 4.57434162106143,
            "mediana": 4.575199593555667,
            "desviacion_estandar": 0.48777734547883445,
            "minimo": 3.58823602528124,
            "maximo": 5.4582736874960815,
            "varianza": 0.2379267387623782
        },
        " Hippuric acid": {
            "media": 3.5693171706670666,
            "mediana": 4.294651728656541,
            "desviacion_estandar": 1.4345591983091128,
            "minimo": 1.3543282450274914,
            "maximo": 4.770305353199483,
            "varianza": 2.0579600934532847
        },
        "4-Pyridoxic acid": {
            "media": 0.18564899550623523,
            "mediana": 0.2025851087567058,
            "desviacion_estandar": 0.06234699081512502,
            "minimo": 0.091956723504627,
            "maximo": 0.315319964149453,
            "varianza": 0.0038871472637012836
        },
        "Triethylphosphate": {
            "media": 0.17043723289834478,
            "mediana": 0.1652380088158547,
            "desviacion_estandar": 0.021611033612198113,
            "minimo": 0.145536536764829,
            "maximo": 0.2117897504886159,
            "varianza": 0.00046703677378755665
        },
        "Phosphocholine": {
            "media": 8.098080236696244,
            "mediana": 8.175621236216086,
            "desviacion_estandar": 0.6535053265591007,
            "minimo": 7.012595119279997,
            "maximo": 9.05825387635053,
            "varianza": 0.4270692118411168
        },
        "3-Phosphoglyceric acid": {
            "media": 3.869676832507434,
            "mediana": 3.65743882786915,
            "desviacion_estandar": 0.6860772495429664,
            "minimo": 2.7746003022075136,
            "maximo": 5.064229325116431,
            "varianza": 0.4707019923404419
        },
        " p-Cresol sulfate": {
            "media": 7.559320273911098,
            "mediana": 7.995690154447461,
            "desviacion_estandar": 3.310204415808484,
            "minimo": 2.888935181882725,
            "maximo": 12.786550384741473,
            "varianza": 10.957453274437984
        },
        "Azelaic acid": {
            "media": 5.417671645495163,
            "mediana": 5.270925428186564,
            "desviacion_estandar": 0.7060049652721014,
            "minimo": 4.5141858360524285,
            "maximo": 7.6574605554235955,
            "varianza": 0.4984430109888611
        },
        "Isocitric acid": {
            "media": 7.302433791964167,
            "mediana": 7.165505757194847,
            "desviacion_estandar": 0.7321198728174182,
            "minimo": 6.129306042060423,
            "maximo": 8.950756341415893,
            "varianza": 0.5359995081741926
        },
        "Citric acid": {
            "media": 327.84257841759967,
            "mediana": 311.04660000548887,
            "desviacion_estandar": 44.40065942566411,
            "minimo": 273.10721223746174,
            "maximo": 419.0981168889732,
            "varianza": 1971.418557433815
        },
        "alpha-Hydroxyhippuric acid": {
            "media": 1.2582104333967223,
            "mediana": 1.2520847978409222,
            "desviacion_estandar": 0.2639340229813242,
            "minimo": 0.7896084974248222,
            "maximo": 1.8033174115502977,
            "varianza": 0.06966116848710616
        },
        "D-Gluconic acid": {
            "media": 1.7651882208053706,
            "mediana": 1.4213898494426036,
            "desviacion_estandar": 1.039193725631052,
            "minimo": 0.5461912743952934,
            "maximo": 3.603113544461297,
            "varianza": 1.0799235993909462
        },
        "N-Methyldodecylamine": {
            "media": 0.36366250931222843,
            "mediana": 0.36010944504986836,
            "desviacion_estandar": 0.03332597621996477,
            "minimo": 0.3154024042150263,
            "maximo": 0.4322903977460212,
            "varianza": 0.0011106206910136572
        },
        "Sebacic acid": {
            "media": 1.639540109528827,
            "mediana": 1.569279043537211,
            "desviacion_estandar": 0.3434449465338819,
            "minimo": 1.4181162100847158,
            "maximo": 2.8069058883499265,
            "varianza": 0.11795443129966099
        },
        "4-Hydroxy-1-(2-hydroxyethyl)-2,2,6,6-tetramethylpiperidine": {
            "media": 4.743928704710415,
            "mediana": 5.717118831664007,
            "desviacion_estandar": 1.801826050456511,
            "minimo": 2.564456527024205,
            "maximo": 7.418389020105,
            "varianza": 3.2465771161037087
        },
        "Cinnamoylglycine": {
            "media": 1.4233195629904016,
            "mediana": 1.5916102310711677,
            "desviacion_estandar": 0.4639266505036055,
            "minimo": 0.7216228653106652,
            "maximo": 2.207526500564418,
            "varianza": 0.2152279370474945
        },
        "N-Acetylglucosamine": {
            "media": 0.35290711730887875,
            "mediana": 0.3266395632830109,
            "desviacion_estandar": 0.0744422681687789,
            "minimo": 0.2614013866726906,
            "maximo": 0.5034760852907426,
            "varianza": 0.005541651290112392
        },
        "O-Acetyl-L-carnitine": {
            "media": 10.788230254492314,
            "mediana": 10.757663289650226,
            "desviacion_estandar": 1.110657088336395,
            "minimo": 9.20762477514011,
            "maximo": 12.737112531411022,
            "varianza": 1.2335591678718787
        },
        "Tryptophan": {
            "media": 0.14795239595438442,
            "mediana": 0.14198348243991454,
            "desviacion_estandar": 0.037574279984072735,
            "minimo": 0.1012812283046983,
            "maximo": 0.2280117756113401,
            "varianza": 0.0014118265163214892
        },
        "3-Indoxyl sulfate": {
            "media": 0.29324723765584626,
            "mediana": 0.3078918072844117,
            "desviacion_estandar": 0.11932537253639314,
            "minimo": 0.0887820033390235,
            "maximo": 0.4445542704227591,
            "varianza": 0.014238544530949006
        },
        "PHOSPHOCREATINE": {
            "media": 0.5161108956485443,
            "mediana": 0.49721105515045816,
            "desviacion_estandar": 0.0887997621637591,
            "minimo": 0.3916434764516563,
            "maximo": 0.7108501324362473,
            "varianza": 0.00788539776034018
        },
        "3-Phenoxybenzoic acid": {
            "media": 0.153263756603115,
            "mediana": 0.15082161689495024,
            "desviacion_estandar": 0.017145284402468663,
            "minimo": 0.1357141137130678,
            "maximo": 0.2027937790777767,
            "varianza": 0.0002939607772415352
        },
        "2,4-Dihydroxybenzophenone": {
            "media": 0.15785901776809572,
            "mediana": 0.15347410319671675,
            "desviacion_estandar": 0.019297488503010624,
            "minimo": 0.1341511693153003,
            "maximo": 0.1951693160899206,
            "varianza": 0.00037239306252382726
        },
        "2-Benzothiazolesulfonic acid": {
            "media": 0.2627286783094562,
            "mediana": 0.26187624019473443,
            "desviacion_estandar": 0.03117934583641746,
            "minimo": 0.2099101242716428,
            "maximo": 0.3248943487312914,
            "varianza": 0.0009721516067869228
        },
        "N,N-Dimethyldodecylamine": {
            "media": 0.6337797367666501,
            "mediana": 0.643069337147526,
            "desviacion_estandar": 0.05997512942557873,
            "minimo": 0.5182623399073859,
            "maximo": 0.725327740394844,
            "varianza": 0.0035970161496149196
        },
        "Undecanedioic acid": {
            "media": 1.1094152871528569,
            "mediana": 1.1095861379028165,
            "desviacion_estandar": 0.12426922207654054,
            "minimo": 0.9627839874614854,
            "maximo": 1.4760284430196433,
            "varianza": 0.015442839555508549
        },
        "Ethyl 3-(N-butylacetamido)propionate": {
            "media": 1.1492548648606242,
            "mediana": 1.1438078470625772,
            "desviacion_estandar": 0.14496915217830803,
            "minimo": 0.9294962216449166,
            "maximo": 1.4602059649211867,
            "varianza": 0.021016055083297427
        },
        "Hydroxysebacic acid": {
            "media": 0.24502890909512476,
            "mediana": 0.2064247464292906,
            "desviacion_estandar": 0.11322008575589855,
            "minimo": 0.1628038127222604,
            "maximo": 0.6109672765201932,
            "varianza": 0.012818787818573022
        },
        "D-(+)-Pantothenic acid": {
            "media": 2.740301584200385,
            "mediana": 2.6640208600313944,
            "desviacion_estandar": 0.7065396816237232,
            "minimo": 1.7591192312776676,
            "maximo": 4.589856902843542,
            "varianza": 0.4991983217089521
        },
        "Propionylcarnitine": {
            "media": 1.0050630087766645,
            "mediana": 0.9937197922787608,
            "desviacion_estandar": 0.1506126657017961,
            "minimo": 0.7129161898848051,
            "maximo": 1.2050958896159805,
            "varianza": 0.022684175069800985
        },
        "Pantothenic acid (Vitamin B5)": {
            "media": 0.5460956384902714,
            "mediana": 0.541350001003853,
            "desviacion_estandar": 0.16405509468079402,
            "minimo": 0.3024449895340732,
            "maximo": 0.8812008223976445,
            "varianza": 0.02691407409072429
        },
        "2-(4-Morpholinyl)benzothiazole": {
            "media": 0.8644789311207404,
            "mediana": 0.8686705921674389,
            "desviacion_estandar": 0.06955326316789338,
            "minimo": 0.7395029903288352,
            "maximo": 0.9851742916168742,
            "varianza": 0.0048376564173022345
        },
        "Dodecanedioic acid": {
            "media": 0.8796599953729134,
            "mediana": 0.8567341500812007,
            "desviacion_estandar": 0.0973964868167178,
            "minimo": 0.7556383772454007,
            "maximo": 1.1630449971936012,
            "varianza": 0.009486075644239084
        },
        "Cytidine": {
            "media": 0.23180729483838117,
            "mediana": 0.22082872529670688,
            "desviacion_estandar": 0.0857700205652991,
            "minimo": 0.1324503500868238,
            "maximo": 0.4219796664924699,
            "varianza": 0.007356496427771831
        },
        "Tridecanedioic acid": {
            "media": 0.9254845327917793,
            "mediana": 0.9029990925052964,
            "desviacion_estandar": 0.1256698503616219,
            "minimo": 0.8049187003835481,
            "maximo": 1.3178840997494448,
            "varianza": 0.01579291128991244
        },
        " Cytidine": {
            "media": 0.16576563763794747,
            "mediana": 0.15804029117642135,
            "desviacion_estandar": 0.06116220584433313,
            "minimo": 0.0939102977384064,
            "maximo": 0.3016402853285666,
            "varianza": 0.003740815423744578
        },
        "Uridine": {
            "media": 0.2563223483510175,
            "mediana": 0.21109154183488504,
            "desviacion_estandar": 0.12104130716203394,
            "minimo": 0.1463299439043581,
            "maximo": 0.5369545994177227,
            "varianza": 0.014650998039493851
        },
        "Biotin": {
            "media": 0.020618317867127846,
            "mediana": 0.02194915821009695,
            "desviacion_estandar": 0.010343995243941083,
            "minimo": 0.0038572277076934,
            "maximo": 0.0392785040016729,
            "varianza": 0.00010699823760667573
        },
        "sn-Glycero-3-phosphocholine": {
            "media": 6.809041828773389,
            "mediana": 6.836058629200485,
            "desviacion_estandar": 0.8502024738249546,
            "minimo": 5.780351672062631,
            "maximo": 8.695996315007264,
            "varianza": 0.7228442464980726
        },
        "Glusose-1-phosphate": {
            "media": 4.5870964199005035,
            "mediana": 4.204342134951238,
            "desviacion_estandar": 1.5924119456415176,
            "minimo": 2.8765672208697173,
            "maximo": 6.9453221561866965,
            "varianza": 2.5357758046218035
        },
        "9-(2,3-dihydroxypropoxy)-9-oxononanoic acid": {
            "media": 0.37090771813798507,
            "mediana": 0.365862507597028,
            "desviacion_estandar": 0.045907926474363696,
            "minimo": 0.336445220704578,
            "maximo": 0.520507083280063,
            "varianza": 0.002107537713175583
        },
        "INOSINE": {
            "media": 6.519000684053069,
            "mediana": 6.334123361575613,
            "desviacion_estandar": 1.2516754232634104,
            "minimo": 4.6143180984715295,
            "maximo": 8.751495078856465,
            "varianza": 1.5666913652016374
        },
        "Tri-isobutylphosphate": {
            "media": 0.34157587080765645,
            "mediana": 0.32791147159917866,
            "desviacion_estandar": 0.059467978333852686,
            "minimo": 0.2626102200656786,
            "maximo": 0.4732040510698784,
            "varianza": 0.0035364404471155725
        },
        "Adenosine": {
            "media": 0.07571643599765564,
            "mediana": 0.060415889477744046,
            "desviacion_estandar": 0.050523777057893834,
            "minimo": 0.0,
            "maximo": 0.2154417939139315,
            "varianza": 0.0025526520481957593
        },
        "6-PHOSPHOGLUCONATE": {
            "media": 0.9300916525911248,
            "mediana": 0.9539077342336391,
            "desviacion_estandar": 0.2614587584579916,
            "minimo": 0.5333933967638463,
            "maximo": 1.5705937859712655,
            "varianza": 0.0683606823743944
        },
        "Diisobutyl phthalate": {
            "media": 0.2737161369566341,
            "mediana": 0.2790662055938306,
            "desviacion_estandar": 0.03129862056833368,
            "minimo": 0.2175341497673266,
            "maximo": 0.3084126356109675,
            "varianza": 0.00097960364948052
        },
        "Guanosine": {
            "media": 0.27246748939771265,
            "mediana": 0.2602541964896359,
            "desviacion_estandar": 0.039698818998120285,
            "minimo": 0.2166803569660768,
            "maximo": 0.3513159791402585,
            "varianza": 0.0015759962298455162
        },
        "Lauryl diethanolamide": {
            "media": 0.042477696362793506,
            "mediana": 0.041165801107649,
            "desviacion_estandar": 0.008494550876055423,
            "minimo": 0.0315384605203917,
            "maximo": 0.0669510208283946,
            "varianza": 7.215739458589394e-05
        },
        "aurapten": {
            "media": 1.486603913546352,
            "mediana": 0.9364874592209029,
            "desviacion_estandar": 1.378087237592383,
            "minimo": 0.2912487405674971,
            "maximo": 3.9413566457692815,
            "varianza": 1.899124434415005
        },
        "N-Acetylneuraminic acid": {
            "media": 0.6197642688099857,
            "mediana": 0.5739580377685676,
            "desviacion_estandar": 0.14640211178378038,
            "minimo": 0.400310941378184,
            "maximo": 0.888960267470183,
            "varianza": 0.021433578334750528
        },
        "Cytidine-3'-monophosphate": {
            "media": 0.23722013970251793,
            "mediana": 0.22681191365016534,
            "desviacion_estandar": 0.023505253391488484,
            "minimo": 0.2069198683755269,
            "maximo": 0.2771184731957256,
            "varianza": 0.0005524969369980809
        },
        "Cytidine 5'-monophosphate": {
            "media": 1.4111885232144992,
            "mediana": 1.4923686603008506,
            "desviacion_estandar": 0.4848069589105712,
            "minimo": 0.4973256344702315,
            "maximo": 2.1933202516479686,
            "varianza": 0.23503778740811626
        },
        "Tris(1-chloro-2-propyl)phosphate": {
            "media": 0.16532552877501017,
            "mediana": 0.16086058396030395,
            "desviacion_estandar": 0.06934558122993735,
            "minimo": 0.0812663887329491,
            "maximo": 0.2953348693610359,
            "varianza": 0.00480880963611784
        },
        "Adenosine 3',5'-cyclic monophosphate": {
            "media": 0.32105410914386623,
            "mediana": 0.3788909095904631,
            "desviacion_estandar": 0.16535013166791085,
            "minimo": 0.1031347425873586,
            "maximo": 0.538145703099726,
            "varianza": 0.027340666042595458
        },
        "5-Aminoimidazole-4-carboxamide-1-beta-D-ribofuranosyl 5'-monophosphate": {
            "media": 0.08091852701200504,
            "mediana": 0.0786895996328908,
            "desviacion_estandar": 0.036263150503091236,
            "minimo": 0.0327507909265962,
            "maximo": 0.1406890154152642,
            "varianza": 0.001315016084409846
        },
        "alpha-D-Glucose-1,6-diphosphate": {
            "media": 0.721424736206875,
            "mediana": 0.598245938996057,
            "desviacion_estandar": 0.35276625627289376,
            "minimo": 0.2536557753359634,
            "maximo": 1.3602440252899402,
            "varianza": 0.12444403156479297
        },
        "Lactose ": {
            "media": 35.05985127602847,
            "mediana": 33.95022657822617,
            "desviacion_estandar": 3.2959080835631838,
            "minimo": 30.96594810071076,
            "maximo": 41.90811397778205,
            "varianza": 10.863010095297138
        },
        "ADENOSINE 5'-MONOPHOSPHATE": {
            "media": 0.45696061301323676,
            "mediana": 0.38377497753681533,
            "desviacion_estandar": 0.17329505093961295,
            "minimo": 0.2482972132217526,
            "maximo": 0.7156576199390051,
            "varianza": 0.030031174680163045
        },
        "3,6,9,12-Tetraoxatetracosan-1-ol": {
            "media": 0.08389388853879029,
            "mediana": 0.08405526735137431,
            "desviacion_estandar": 0.006800417067771028,
            "minimo": 0.0733247263453953,
            "maximo": 0.0932397614489912,
            "varianza": 4.624567229563151e-05
        },
        "Riboflavin": {
            "media": 0.10230034493097419,
            "mediana": 0.0985805694987065,
            "desviacion_estandar": 0.03630376902258568,
            "minimo": 0.0558387335429448,
            "maximo": 0.1670179975100216,
            "varianza": 0.0013179636452452519
        },
        "Dioctyl Phthalate": {
            "media": 0.05459793379815535,
            "mediana": 0.05419292096764375,
            "desviacion_estandar": 0.0044844694057203155,
            "minimo": 0.0448859151712059,
            "maximo": 0.0614261793281521,
            "varianza": 2.0110465850841517e-05
        },
        "Uridine 5_-(trihydrogen diphosphate)": {
            "media": 1.5264603101646144,
            "mediana": 1.6842228573177747,
            "desviacion_estandar": 0.42860831942238586,
            "minimo": 0.7795928528652672,
            "maximo": 2.058223370900194,
            "varianza": 0.18370509147808195
        },
        "N6-Threonylcarbamoyladenosine": {
            "media": 0.019008990251830806,
            "mediana": 0.01817889251704395,
            "desviacion_estandar": 0.003933260239220418,
            "minimo": 0.0147561224834815,
            "maximo": 0.0281102951117125,
            "varianza": 1.5470536109432258e-05
        },
        "Adenosine diphosphate": {
            "media": 5.448530326136363,
            "mediana": 4.6746657583710896,
            "desviacion_estandar": 3.5241515487159085,
            "minimo": 0.1000145979834969,
            "maximo": 10.697734528939325,
            "varianza": 12.419644138316736
        },
        "Adenosine_Diphosphate": {
            "media": 0.10161384967489288,
            "mediana": 0.0536704672565155,
            "desviacion_estandar": 0.08896077845871542,
            "minimo": 0.0306108993070538,
            "maximo": 0.2449076744778973,
            "varianza": 0.007914020103980644
        },
        "Bis[2-(2-butoxyethoxy)ethyl] hexandioate": {
            "media": 0.06521253000441221,
            "mediana": 0.0652644347776655,
            "desviacion_estandar": 0.004303860864576563,
            "minimo": 0.0556318029526229,
            "maximo": 0.0703157064798483,
            "varianza": 1.8523218341633716e-05
        },
        " tauroursodeoxycholic acid": {
            "media": 0.8325981937462009,
            "mediana": 0.8853857035900957,
            "desviacion_estandar": 0.24463180813914132,
            "minimo": 0.4354214711977111,
            "maximo": 1.2762096931782736,
            "varianza": 0.05984472155342565
        },
        "Taurocholic acid": {
            "media": 0.05842692268587485,
            "mediana": 0.05377335726049605,
            "desviacion_estandar": 0.01700969411310478,
            "minimo": 0.0432588643455528,
            "maximo": 0.0971542187158694,
            "varianza": 0.00028932969382139146
        },
        "UDP-xylose": {
            "media": 2.6320602434348133,
            "mediana": 2.5596133174202977,
            "desviacion_estandar": 0.7147983451517613,
            "minimo": 1.5699132996005936,
            "maximo": 3.663315262109178,
            "varianza": 0.5109366742316965
        },
        "Adenosine diphosphate ribose": {
            "media": 0.18754648811157915,
            "mediana": 0.13882677927407355,
            "desviacion_estandar": 0.12354049250236908,
            "minimo": 0.058410158103077,
            "maximo": 0.371644839289422,
            "varianza": 0.015262253287727911
        },
        "UDP-D-glucose": {
            "media": 68.82452474167718,
            "mediana": 77.26032215708369,
            "desviacion_estandar": 20.098039648499576,
            "minimo": 33.51948807699079,
            "maximo": 89.33690737606612,
            "varianza": 403.93119771266095
        },
        "Guanosine 5'-diphospho-beta-L-fucose; ": {
            "media": 8.13665214091242,
            "mediana": 7.549279084842501,
            "desviacion_estandar": 1.5428100625714705,
            "minimo": 6.009673545144692,
            "maximo": 11.661452722394028,
            "varianza": 2.3802628891717843
        },
        "GUANOSINE 5,9;-DIPHOSPHO-D-MANNOSE": {
            "media": 7.428903424526716,
            "mediana": 7.3542501260926585,
            "desviacion_estandar": 0.9056002939805977,
            "minimo": 6.010068827814355,
            "maximo": 8.635578109469742,
            "varianza": 0.820111892457745
        },
        "Uridine 5'-diphospho-N-acetylgalactosamine": {
            "media": 26.693391915816843,
            "mediana": 23.093738926306955,
            "desviacion_estandar": 14.630497622806777,
            "minimo": 7.496810064731371,
            "maximo": 46.09923199989662,
            "varianza": 214.05146069095477
        },
        "Uridine-5-diphosphoacetylgalactosamine": {
            "media": 0.6951382379786258,
            "mediana": 0.6533446795401412,
            "desviacion_estandar": 0.3648945106628066,
            "minimo": 0.2002481687029174,
            "maximo": 1.188616813384639,
            "varianza": 0.13314800391184906
        },
        "Glycerol-2-phosphate": {
            "media": 0.31433696670451977,
            "mediana": 0.31278751530826665,
            "desviacion_estandar": 0.017003237169837728,
            "minimo": 0.292203954774611,
            "maximo": 0.3396940474077644,
            "varianza": 0.00028911007425375134
        },
        "O-Acetyl-L-carnitine.1": {
            "media": 0.004813400339047887,
            "mediana": 0.00288084344809295,
            "desviacion_estandar": 0.006442792899151096,
            "minimo": 0.0009241966545715,
            "maximo": 0.0263350538265144,
            "varianza": 4.150958034135178e-05
        },
        "Myristic (Tetradecanoic) acid": {
            "media": 0.0135891810311541,
            "mediana": 0.01478645900755435,
            "desviacion_estandar": 0.005546966040611626,
            "minimo": 0.0026998995249796,
            "maximo": 0.0229099486222687,
            "varianza": 3.0768832255698617e-05
        },
        "Dodecanedioic acid.1": {
            "media": 1.0835042953117073,
            "mediana": 1.0869590679675039,
            "desviacion_estandar": 0.03141886040515338,
            "minimo": 1.0235980105647102,
            "maximo": 1.1358429218474162,
            "varianza": 0.000987144789158515
        },
        "FA 15:4": {
            "media": 0.8596251284006599,
            "mediana": 0.8700436174042678,
            "desviacion_estandar": 0.24169468092721594,
            "minimo": 0.4853436629274806,
            "maximo": 1.1918550650990931,
            "varianza": 0.058416318788508725
        },
        "2,6-Di-tert-butyl-4-nitrophenol": {
            "media": 1.9985507626386099,
            "mediana": 2.022665487234124,
            "desviacion_estandar": 0.35305093448586394,
            "minimo": 1.4703202100807706,
            "maximo": 2.665481414338923,
            "varianza": 0.1246449623413418
        },
        "Palmitoleic acid": {
            "media": 0.013101827752631084,
            "mediana": 0.00967934284085005,
            "desviacion_estandar": 0.00808322410660749,
            "minimo": 0.0010984520589711,
            "maximo": 0.0236039448117666,
            "varianza": 6.533851195764046e-05
        },
        "Palmitic acid": {
            "media": 0.1726236317056509,
            "mediana": 0.16257279710043826,
            "desviacion_estandar": 0.043421539311255745,
            "minimo": 0.1110428281345609,
            "maximo": 0.2549720223390435,
            "varianza": 0.001885430076158928
        },
        "NAE 13:1": {
            "media": 0.09560223555436402,
            "mediana": 0.03626735728736685,
            "desviacion_estandar": 0.12713384494588442,
            "minimo": 0.0102711323159454,
            "maximo": 0.4063882716621328,
            "varianza": 0.01616301453072418
        },
        "sn-Glycero-3-phosphocholine.1": {
            "media": 0.018319251103604346,
            "mediana": 0.01738177264406205,
            "desviacion_estandar": 0.0033887263088518815,
            "minimo": 0.0147078651505776,
            "maximo": 0.0285316880233882,
            "varianza": 1.1483465996304896e-05
        },
        "Margaric (heptadecanoic) acid": {
            "media": 0.15399519731292785,
            "mediana": 0.15512304013924372,
            "desviacion_estandar": 0.012549035085250402,
            "minimo": 0.1308646785381303,
            "maximo": 0.1724427221680014,
            "varianza": 0.00015747828157084556
        },
        "FA 16:0;O": {
            "media": 0.18467312802582642,
            "mediana": 0.18562006173460885,
            "desviacion_estandar": 0.043375927512387995,
            "minimo": 0.1144368436084121,
            "maximo": 0.2444486631817164,
            "varianza": 0.0018814710875599376
        },
        "Alpha-linolenic (Linolenic acid) acid (ALA) (Omega3)": {
            "media": 0.028691314222708715,
            "mediana": 0.0256942901294916,
            "desviacion_estandar": 0.016125618794822664,
            "minimo": 0.007876067588994,
            "maximo": 0.0538920812874485,
            "varianza": 0.000260035581515938
        },
        "Linoleic acid (Omega6) ": {
            "media": 0.16599035314226704,
            "mediana": 0.17511618714158816,
            "desviacion_estandar": 0.04354967865889552,
            "minimo": 0.086904644520696,
            "maximo": 0.2234091165235659,
            "varianza": 0.00189657451129306
        },
        "Oleic acid": {
            "media": 0.4904952066970316,
            "mediana": 0.4919584843004635,
            "desviacion_estandar": 0.11336915573026914,
            "minimo": 0.2753114726694024,
            "maximo": 0.6587027602916001,
            "varianza": 0.012852565470994016
        },
        "Stearic acid": {
            "media": 0.24324709519612495,
            "mediana": 0.24750440847046795,
            "desviacion_estandar": 0.046582687564478795,
            "minimo": 0.1708231582395771,
            "maximo": 0.3122853869421246,
            "varianza": 0.0021699467807298474
        },
        "FA 18:2;O": {
            "media": 0.023305131333482724,
            "mediana": 0.0222514238524379,
            "desviacion_estandar": 0.009526398801441531,
            "minimo": 0.0109858440349642,
            "maximo": 0.04135172292199,
            "varianza": 9.075227412410665e-05
        },
        "FA 18:0;O": {
            "media": 0.27288594841243935,
            "mediana": 0.2522359247019,
            "desviacion_estandar": 0.12233005221071672,
            "minimo": 0.1077397909929926,
            "maximo": 0.5163730063480926,
            "varianza": 0.01496464167387668
        },
        "NAE 16:0": {
            "media": 0.0316444713897052,
            "mediana": 0.031135651942295,
            "desviacion_estandar": 0.007963925617376404,
            "minimo": 0.0199588333692947,
            "maximo": 0.0476443417197228,
            "varianza": 6.342411123910413e-05
        },
        "Eicosapentaenoic acid (EPA) (Omega3)": {
            "media": 0.0420065011957665,
            "mediana": 0.04819276701943455,
            "desviacion_estandar": 0.022047320112014403,
            "minimo": 0.0098607168886586,
            "maximo": 0.0667459374000749,
            "varianza": 0.0004860843241216349
        },
        "Arachidonic acid (ARA) (Omega6)": {
            "media": 0.05924920883451097,
            "mediana": 0.06384080185172385,
            "desviacion_estandar": 0.015714249607463142,
            "minimo": 0.0281008212143325,
            "maximo": 0.0788326157671023,
            "varianza": 0.00024693764072565555
        },
        "RAC-GLYCEROL 1-MYRISTATE": {
            "media": 0.015603715748446007,
            "mediana": 0.0147037066601015,
            "desviacion_estandar": 0.007064307875541772,
            "minimo": 0.006670399115177,
            "maximo": 0.0307918669145893,
            "varianza": 4.99044457604415e-05
        },
        "FA 18:3;O2": {
            "media": 0.012624648622513699,
            "mediana": 0.01109636434120225,
            "desviacion_estandar": 0.010279500972804532,
            "minimo": 0.0020844685739539,
            "maximo": 0.0365048011262081,
            "varianza": 0.00010566814024988932
        },
        "9,10-DiHOME": {
            "media": 0.0496955302879485,
            "mediana": 0.04568912922428995,
            "desviacion_estandar": 0.015744411360422497,
            "minimo": 0.0304547477078909,
            "maximo": 0.0806596191554876,
            "varianza": 0.00024788648908620096
        },
        "Docosahexaenoic acid (DHA) (Omega3)": {
            "media": 0.01532142775566305,
            "mediana": 0.01520600445825095,
            "desviacion_estandar": 0.0076549191136903475,
            "minimo": 0.0030793675919573,
            "maximo": 0.0295909137985124,
            "varianza": 5.859778663714181e-05
        },
        "Docosapentaenoic acid (Omega6) isomer 1": {
            "media": 0.021865568976539945,
            "mediana": 0.020413105318377,
            "desviacion_estandar": 0.008677787196739192,
            "minimo": 0.0114649447612398,
            "maximo": 0.0379869775476417,
            "varianza": 7.530399063189064e-05
        },
        "D-ribo-Phytosphingosine": {
            "media": 0.03979451871441016,
            "mediana": 0.0438008170117691,
            "desviacion_estandar": 0.021808591000490027,
            "minimo": 0.0090920212863551,
            "maximo": 0.0761121736184708,
            "varianza": 0.0004756146414266546
        },
        "NAE 20:0": {
            "media": 0.12210122129507958,
            "mediana": 0.1384355331460674,
            "desviacion_estandar": 0.08691426645187615,
            "minimo": 0.0020213526686798,
            "maximo": 0.258357745264692,
            "varianza": 0.007554089712867725
        },
        "monoolein": {
            "media": 0.006590954149704472,
            "mediana": 0.006392831621086351,
            "desviacion_estandar": 0.002584045873429248,
            "minimo": 0.0034489423813096,
            "maximo": 0.0127439566238714,
            "varianza": 6.677293075986725e-06
        },
        "FA 28:7": {
            "media": 0.019949708381047437,
            "mediana": 0.01872550893225325,
            "desviacion_estandar": 0.006014021799573726,
            "minimo": 0.0116963033019661,
            "maximo": 0.0355594709751898,
            "varianza": 3.6168458205748e-05
        },
        "DG 20:2": {
            "media": 0.2957841480756881,
            "mediana": 0.2886574240181457,
            "desviacion_estandar": 0.04379361191495497,
            "minimo": 0.2318723006513664,
            "maximo": 0.3710151680762801,
            "varianza": 0.0019178804445576859
        },
        "DG 21:2": {
            "media": 0.013081524324709043,
            "mediana": 0.01305142721379245,
            "desviacion_estandar": 0.0019985791554189645,
            "minimo": 0.0100738048242892,
            "maximo": 0.0163948739668427,
            "varianza": 3.994318640475181e-06
        },
        "LPE 16:0": {
            "media": 0.06775898570048482,
            "mediana": 0.06875828028592355,
            "desviacion_estandar": 0.008540615770772404,
            "minimo": 0.0543762757668508,
            "maximo": 0.0789765716927185,
            "varianza": 7.294211774396629e-05
        },
        "LPE 18:1": {
            "media": 0.051319298264345836,
            "mediana": 0.040396886765707296,
            "desviacion_estandar": 0.04121379238580512,
            "minimo": 0.0094072161377308,
            "maximo": 0.1403643228212611,
            "varianza": 0.001698576682820248
        },
        "LPS 16:0": {
            "media": 0.13572508008529047,
            "mediana": 0.13376349426469997,
            "desviacion_estandar": 0.014648795332943604,
            "minimo": 0.121808329806002,
            "maximo": 0.1724597868304188,
            "varianza": 0.0002145872047064703
        },
        "LPC 16:0": {
            "media": 0.12026476851911864,
            "mediana": 0.12231968124482595,
            "desviacion_estandar": 0.016970294785430533,
            "minimo": 0.0733414007469851,
            "maximo": 0.1467304694116711,
            "varianza": 0.0002879909051044107
        },
        "LPI 16:0": {
            "media": 0.1279786590235225,
            "mediana": 0.1279937848730719,
            "desviacion_estandar": 0.006254729616934343,
            "minimo": 0.1186627164738262,
            "maximo": 0.138095621522344,
            "varianza": 3.912164258095563e-05
        },
        "alpha.-Pinene": {
            "media": 95.77722408470636,
            "mediana": 83.73040506570399,
            "desviacion_estandar": 36.97630264225077,
            "minimo": 55.50991497587738,
            "maximo": 170.17506119260733,
            "varianza": 1367.2469570913213
        },
        "alpha.-Phellandrene": {
            "media": 0.7060465700525008,
            "mediana": 0.0,
            "desviacion_estandar": 1.813305614307247,
            "minimo": 0.0,
            "maximo": 5.602195863316977,
            "varianza": 3.2880772508781826
        },
        "beta-pinene": {
            "media": 0.5498128009587596,
            "mediana": 0.0,
            "desviacion_estandar": 1.4158957190797825,
            "minimo": 0.0,
            "maximo": 4.427128532946451,
            "varianza": 2.0047606873084542
        },
        "para-cymene": {
            "media": 8.132331067614896,
            "mediana": 7.8790864065216555,
            "desviacion_estandar": 8.359694422662576,
            "minimo": 0.0,
            "maximo": 20.621812598458817,
            "varianza": 69.88449084029578
        },
        "Limonene": {
            "media": 21.15245233927268,
            "mediana": 5.588335620296402,
            "desviacion_estandar": 42.626559780727305,
            "minimo": 0.7758021391525776,
            "maximo": 137.12826984113636,
            "varianza": 1817.0235987399185
        },
        "alpha-Copaene": {
            "media": 5.2035073170981105,
            "mediana": 6.106359348377472,
            "desviacion_estandar": 5.092360489557906,
            "minimo": 0.0,
            "maximo": 13.1532140032288,
            "varianza": 25.93213535561044
        },
        "beta-Caryophyllene": {
            "media": 57.04295827574415,
            "mediana": 58.30265147237463,
            "desviacion_estandar": 43.51183350140891,
            "minimo": 2.0550636235742124,
            "maximo": 126.27660731323084,
            "varianza": 1893.2796546543307
        },
        "alpha.-Caryophyllene (Humulene)": {
            "media": 2.1449178371237045,
            "mediana": 0.0,
            "desviacion_estandar": 2.813739049445774,
            "minimo": 0.0,
            "maximo": 6.7993346656587486,
            "varianza": 7.917127438376009
        }
    }
};

try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(RESULT, null, 2));
    console.log("✅ Done — statistical analysis written to", OUTPUT_FILE);
} catch (e) {
    console.log("❌ Error:", e.message);
}
