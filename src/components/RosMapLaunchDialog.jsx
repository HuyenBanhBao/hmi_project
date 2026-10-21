import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogContentText, DialogTitle, MenuItem, TextField,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useRos } from "../context/RosContext";
import useRosPublisher from "../hooks/useRosPublisher";
import useRosTopic from "../hooks/useRosTopic";
import {
    createMapRequestId, getMapNameError, MAP_COMMAND_TOPIC, MAP_LIST_TOPIC,
    normalizeMapName, SAVE_MAP_LAUNCH,
} from "./rosMapCommands";

const RESPONSE_TIMEOUT_MS = 8000;

const RosMapLaunchDialog = ({ command, status, onLaunch, onClose }) => {
    const theme = useTheme();
    const { isConnected } = useRos();
    const publishMapCommand = useRosPublisher(MAP_COMMAND_TOPIC, "std_msgs/String");
    const mapListMessage = useRosTopic(MAP_LIST_TOPIC, "std_msgs/String");
    const [maps, setMaps] = useState([]);
    const [mapName, setMapName] = useState("");
    const [listLoading, setListLoading] = useState(true);
    const [listReady, setListReady] = useState(false);
    const [listError, setListError] = useState("");
    const [submitError, setSubmitError] = useState("");
    const [submittedRequestId, setSubmittedRequestId] = useState("");
    const listRequestRef = useRef("");
    const listTimerRef = useRef(null);
    const submitTimerRef = useRef(null);
    const isSave = command.launch === SAVE_MAP_LAUNCH;
    const normalizedName = normalizeMapName(mapName);
    const duplicateName = isSave && maps.some((map) => map.name === normalizedName);
    const nameError = isSave && normalizedName ? getMapNameError(normalizedName) : "";
    const isSubmitting = Boolean(submittedRequestId);
    const validSelection = isSave
        ? Boolean(normalizedName) && !nameError && !duplicateName
        : maps.some((map) => map.name === normalizedName);

    const refreshMaps = useCallback(() => {
        window.clearTimeout(listTimerRef.current);
        const requestId = createMapRequestId();
        listRequestRef.current = requestId;
        setListLoading(true);
        setListReady(false);
        setListError("");
        if (!isConnected || !publishMapCommand({
            data: JSON.stringify({ action: "list", target_machine: command.targetMachine, request_id: requestId }),
        })) {
            setListLoading(false);
            setListError("Chưa kết nối được tới robot để lấy danh sách bản đồ.");
            return;
        }
        listTimerRef.current = window.setTimeout(() => {
            setListLoading(false);
            setListError("Robot chưa trả về danh sách bản đồ. Kiểm tra kết nối và dịch vụ bản đồ trên robot.");
        }, RESPONSE_TIMEOUT_MS);
    }, [command.targetMachine, isConnected, publishMapCommand]);

    useEffect(() => {
        refreshMaps();
        return () => window.clearTimeout(listTimerRef.current);
    }, [refreshMaps]);

    useEffect(() => () => window.clearTimeout(submitTimerRef.current), []);

    useEffect(() => {
        if (!mapListMessage?.data) return;
        let payload;
        try {
            payload = JSON.parse(mapListMessage.data);
        } catch {
            return;
        }
        // Danh sách phải do đúng robot trả về cho đúng lần yêu cầu hiện tại.
        // Không dùng tên lưu ở trình duyệt để giả định file đã tồn tại trên robot.
        if (!payload || payload.machine_name !== command.targetMachine
            || payload.request_id !== listRequestRef.current) return;
        window.clearTimeout(listTimerRef.current);
        setListLoading(false);
        if (payload.error || !Array.isArray(payload.maps)) {
            setListError(payload.error || "Robot trả về danh sách bản đồ không hợp lệ.");
            return;
        }
        setMaps(payload.maps.filter((map) => typeof map?.name === "string" && !getMapNameError(map.name)));
        setListReady(true);
        setListError("");
    }, [command.targetMachine, mapListMessage]);

    useEffect(() => {
        if (!submittedRequestId || status?.request_id !== submittedRequestId
            || status?.machine_name !== command.targetMachine) return;
        if (["saving", "started", "already_running", "saved"].includes(status.event)) {
            window.clearTimeout(submitTimerRef.current);
            onClose();
        } else if (["rejected", "save_failed", "start_failed", "exited"].includes(status.event)) {
            window.clearTimeout(submitTimerRef.current);
            setSubmittedRequestId("");
            setSubmitError(status.message || status.error || "Robot không khởi chạy được tác vụ. Hãy kiểm tra lại.");
        }
    }, [command.targetMachine, onClose, status, submittedRequestId]);

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!isConnected || !listReady || !validSelection || isSubmitting) return;
        setSubmitError("");
        // publish thành công mới chỉ là đã gửi. Hộp thoại chờ phản hồi ROS có
        // cùng request_id; tiến độ saving/saved được hiển thị tại hàng tác vụ.
        const requestId = onLaunch({ ...command, mapName: normalizedName });
        if (!requestId) {
            setSubmitError("Chưa gửi được lệnh tới robot. Hãy kiểm tra kết nối.");
            return;
        }
        setSubmittedRequestId(requestId);
        submitTimerRef.current = window.setTimeout(() => {
            setSubmittedRequestId("");
            setSubmitError("Chưa nhận được xác nhận từ robot. Kiểm tra trạng thái tác vụ trước khi gửi lại.");
        }, RESPONSE_TIMEOUT_MS);
    };

    return (
        <Dialog
            open
            fullWidth
            maxWidth="sm"
            onClose={() => { if (!isSubmitting) onClose(); }}
            aria-labelledby="ros-map-dialog-title"
            sx={{ zIndex: 1600 }}
            PaperProps={{
                component: "form",
                onSubmit: handleSubmit,
                sx: {
                    color: theme.hmi.colorSnowGray,
                    bgcolor: theme.hmi.colorDeepNavy,
                    backgroundImage: theme.hmi.primaryColorBgGradientSlidebarDark135,
                    border: `1px solid ${alpha(theme.hmi.colorSnowGray, 0.2)}`,
                    borderRadius: 2,
                    "& .MuiInputLabel-root, & .MuiFormHelperText-root": { color: theme.hmi.colorPaleSky },
                    "& .MuiInputBase-root": { color: theme.hmi.colorSnowGray },
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: alpha(theme.hmi.colorSnowGray, 0.4) },
                    "& .MuiSelect-icon": { color: theme.hmi.colorSnowGray },
                },
            }}
        >
            <DialogTitle id="ros-map-dialog-title">{isSave ? "Lưu bản đồ 2D" : "Chọn bản đồ để chạy"}</DialogTitle>
            <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <DialogContentText sx={{ color: theme.hmi.colorPaleSky }}>
                    {isSave
                        ? "Đặt tên bản đồ sẽ lưu trên robot. Mỗi lần quét nên dùng một tên riêng."
                        : "Chọn bản đồ đã lưu trên robot rồi nhấn Launch để khởi chạy môi trường SLAM."}
                </DialogContentText>
                {listLoading ? (
                    <Box role="status" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <CircularProgress size={18} color="inherit" /> Đang lấy danh sách bản đồ từ robot…
                    </Box>
                ) : null}
                {listError ? <Alert severity="error">{listError}</Alert> : null}
                {submitError ? <Alert severity="error">{submitError}</Alert> : null}
                {isSave ? (
                    <TextField
                        autoFocus
                        fullWidth
                        label="Tên bản đồ"
                        value={mapName}
                        onChange={(event) => setMapName(event.target.value)}
                        disabled={isSubmitting}
                        error={Boolean(nameError || duplicateName)}
                        helperText={duplicateName ? "Tên đã tồn tại trên robot. Hãy chọn tên khác." : nameError || "Không nhập đuôi file. Ví dụ: Sân thử nghiệm 01"}
                        inputProps={{ maxLength: 80 }}
                    />
                ) : (
                    <TextField
                        select
                        fullWidth
                        label="Bản đồ trên robot"
                        value={maps.some((map) => map.name === mapName) ? mapName : ""}
                        onChange={(event) => setMapName(event.target.value)}
                        disabled={!listReady || listLoading || isSubmitting || maps.length === 0}
                        helperText={listReady && maps.length === 0 ? "Chưa có bản đồ. Hãy quét địa hình và lưu bản đồ trước." : " "}
                        SelectProps={{ MenuProps: { sx: { zIndex: 1700 } } }}
                    >
                        {maps.map((map) => <MenuItem key={map.name} value={map.name}>{map.name}</MenuItem>)}
                    </TextField>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button color="inherit" onClick={refreshMaps} disabled={listLoading || isSubmitting || !isConnected}>
                    Tải lại danh sách
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button color="inherit" onClick={onClose} disabled={isSubmitting}>Hủy</Button>
                <Button
                    type="submit"
                    variant="contained"
                    disabled={!isConnected || !listReady || listLoading || !validSelection || isSubmitting}
                    startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : null}
                    sx={{ bgcolor: theme.hmi.primarySuccessColor }}
                >
                    {isSubmitting ? "Đang gửi…" : isSave ? "Lưu bản đồ" : "Launch"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default RosMapLaunchDialog;
