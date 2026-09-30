import { extendTheme } from "@mui/material/styles";

// MAIN AND ARTICLE
const GRADIENT_BG_1 = "linear-gradient(135deg, #0b4a3b  0%, #2F5A12 50%, #48801B 100% )";
const GRADIENT_BG = "linear-gradient(135deg, #0b4a3b  0%, #2F5A12 100% )";
const GRADIENT_BG_SLIDEBAR = "linear-gradient(135deg, #c9e3b0ff  0%, #F2F2F2 100% )";
const GRADIENT_BG_DARK = "linear-gradient(135deg, #041B2D  0%, #004E9A 100%)";
// PROJECT
const GRADIENT_BG_PROJECT = "linear-gradient(135deg, #FFC286  0%, #FFD966 50%, #EAE7CB 100% )";
const GRADIENT_BG_PROJECT_1 = "linear-gradient(135deg, #FFBD81  0%, #EAE7CB 100% )";
const GRADIENT_BG_PRO = "linear-gradient(135deg, #EFDDB4  0%, #FFFFFF 100% )";

const GRADIENT_BG_SLIDEBAR_DARK = "linear-gradient(180deg, #00203E 0%, #1F2633 50%, #0d362d 100%)";
const GRADIENT_BG_SLIDEBAR_DARK_135 = "linear-gradient(135deg, #00203E 0%, #1F2633 50%, #0d362d 100%)";

// Dissertation
// Dissertation

const GRADIENT_BG_DISSERTATION = "linear-gradient(135deg, #2196f3  0%, #81d0ff 50%, #EAE7CB 100% )";
const GRADIENT_BG_DISSERTATION_1 = "linear-gradient(135deg, #81d0ff  0%, #FFFFFF 100% )";
const GRADIENT_BG_DIS = "linear-gradient(135deg, #b1e5fc80  0%, #FFFFFF 100% )";
const GRADIENT_BG_ART = "linear-gradient(135deg, #e6f4eaff  0%, #FFFFFF 100% )";

const theme = extendTheme({
    hmi: {
        primaryColorBgGradient: GRADIENT_BG,
        primaryColorBgGradient1: GRADIENT_BG_1,
        primaryColorBgGradientSlidebar: GRADIENT_BG_SLIDEBAR,
        // =================================================
        colorGradientProject: GRADIENT_BG_PROJECT,
        colorGradientProject1: GRADIENT_BG_PROJECT_1,
        colorGradientPro: GRADIENT_BG_PRO,
        // =================================================
        colorGradientDissertation: GRADIENT_BG_DISSERTATION,
        colorGradientDissertation1: GRADIENT_BG_DISSERTATION_1,
        colorGradientDis: GRADIENT_BG_DIS,
        colorGradientArt: GRADIENT_BG_ART,

        primaryColorBgGradientSlidebarDark: GRADIENT_BG_SLIDEBAR_DARK,
        primaryColorBgGradientSlidebarDark135: GRADIENT_BG_SLIDEBAR_DARK_135,
        primarySuccessColor: "#097109",

        // dùng làm nền chính, nav bar, overlay
        colorSlateBlue: "#485766", // Xanh slate tối
        colorGunmetalBlue: "#2B3544", // Xanh súng đậm
        colorMidnightBlue: "#1F2633", // Xanh navy siêu tối
        colorObsidianSlate: "#252E39", // Slate đen-xám
        colorDarkNavyGray: "#333C4D", // Xanh xám navy đậm
        colorDeepNavy: "#00203E", // Xanh navy đậm
        primaryColorHvqp: "#0b4a3b",
        colorBtnOrange: "#FB8F2C", // Nút nhấn màu cam
        colorError: "#D64545", // Đỏ cảnh báo
        colorSnowGray: "#F2F2F2", // Xám tuyết (gần trắng)
        // dùng border, text phụ, divider
        colorAshGray: "#708393", // Xám tro
        colorIronBlue: "#627487", // Xanh xám thép
        colorPaleSky: "#B1C0CD", // Xanh trời nhạt
        colorFrostGray: "#9AA9B9", // Xám xanh mát
        colorCloudySteel: "#A4B3C4", // Xám mây nhạt
        colorPrimary: "#4caf50", // Xanh lá đậm (màu chính)
        primaryColorBg: "#EAE7CB", // Vàng be dịu
        colorBgDark: "#c9e3b0ff", // Nền đậm hơn (highlight nhẹ)
        colorLemonChiffon: "#FEF6C7", // Kem nhạt text

        colorBgDarkV1: "#222343", // Kem nhạt text

        boxShadowPrimary:
            "rgba(0, 0, 0, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px, rgba(10, 37, 64, 0.35) 0px -2px 6px 0px inset",

        boxShadowBtn:
            "rgba(0, 0, 0, 0.4) 0px 2px 4px, rgba(0, 0, 0, 0.3) 0px 7px 13px -3px, rgba(0, 0, 0, 0.2) 0px -3px 0px inset",
        boxShadowBtnHover:
            "rgba(0, 0, 0, 0.3) 0px 2px 4px, rgba(0, 0, 0, 0.2) 0px 5px 10px -2px, rgba(0, 0, 0, 0.15) 0px -2px 0px inset",

        boxShadow_map:
            "rgba(0, 0, 0, 0.4) 0px 2px 4px, rgba(0, 0, 0, 0.3) 0px 7px 13px -3px, rgba(0, 0, 0, 0.2) 0px -3px 0px inset",
    },
    // =====================================================
    components: {
        MuiCssBaseline: {
            styleOverrides: {},
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: "none",
                    borderWidth: "0.5px",
                    "&:hover": {
                        borderWidth: "0.5px",
                    },
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: () => ({
                    fontSize: "0.875rem",
                }),
            },
        },
        MuiTypography: {
            styleOverrides: {
                root: () => ({
                    "&.MuiTypography-body1": {
                        fontSize: "0.875rem",
                    },
                }),
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: () => ({
                    fontSize: "0.875rem",
                    "& fieldset": {
                        borderWidth: "1px !important",
                    },
                }),
            },
        },
    },
});

export default theme;
