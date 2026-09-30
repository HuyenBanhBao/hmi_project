import { Box } from "@mui/material";

const Joystick = ({ activeDirection }) => {
    const getColor = (dir) => {
        return activeDirection === dir ? "yellow" : "rgba(0,0,0,0.8)";
    };

    return (
        <Box sx={{ width: 180 }}>
            <svg width="100%" height="100%" viewBox="0 0 100 100">
                <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgb(16,16,16)" />
                        <stop offset="100%" stopColor="rgb(240,240,240)" />
                    </linearGradient>

                    <linearGradient id="grad2" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgb(240,240,240)" />
                        <stop offset="100%" stopColor="rgb(16,16,16)" />
                    </linearGradient>

                    <linearGradient id="grad3" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgb(168,168,168)" />
                        <stop offset="100%" stopColor="rgb(239,239,239)" />
                    </linearGradient>
                </defs>

                <circle cx="50" cy="50" r="50" fill="url(#grad1)" />
                <circle cx="50" cy="50" r="47" fill="url(#grad2)" stroke="black" strokeWidth="1.5" />
                <circle cx="50" cy="50" r="44" fill="url(#grad3)" />

                {/* arrows */}
                <path d="M50,14 54,22 46,22Z" fill={getColor("UP")} />
                <path d="M50,86 54,78 46,78Z" fill={getColor("DOWN")} />
                <path d="M14,50 22,54 22,46Z" fill={getColor("LEFT")} />
                <path d="M86,50 78,54 78,46Z" fill={getColor("RIGHT")} />
            </svg>
        </Box>
    );
};

export default Joystick;
