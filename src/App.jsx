import { CssBaseline } from "@mui/material";
import { Routes, Route, Navigate } from "react-router-dom";
import Main_page from "./Main_page/Main_page";

// ================================== MAIN ==================================
function App() {
    return (
        <>
            <CssBaseline />
            <Routes>
                <Route path="/" element={<Navigate to="/trung_tam_dieu_khien" replace={true} />} />
                {/* ----------------- Main Page ----------------- */}
                <Route path="/trung_tam_dieu_khien" element={<Main_page />} />
            </Routes>
        </>
    );
}

export default App;
