# Chọn và đặt tên bản đồ từ giao diện vali

Phần giao diện đã có hộp nhập tên khi bấm RUN ở **Lưu bản đồ 2D** và hộp chọn
bản đồ khi bấm RUN ở **Chạy môi trường SLAM**. Việc chạy launch, lưu file và
đọc thư mục bản đồ sẽ được bổ sung sau trên máy robot `cuong`.

Giao diện chưa thể lấy danh sách hoặc thực hiện hai tác vụ này nếu robot chưa
triển khai giao thức bên dưới. Các nút RUN/STOP của EKF, LiDAR và quét địa hình
vẫn dùng `/hmi/launch_command` như trước.

## Các topic

Tất cả message bên dưới dùng `std_msgs/String`, trường `data` là chuỗi JSON.

| Topic | Hướng | Nội dung |
| --- | --- | --- |
| `/hmi/map_command` | Vali → robot | Lấy danh sách, lưu, chạy hoặc dừng tác vụ bản đồ |
| `/hmi/map_list` | Robot → vali | Danh sách bản đồ của robot và `request_id` tương ứng |
| `/hmi/launch_status` | Robot → vali | Xác nhận và tiến độ của tác vụ |

Hai tác vụ bản đồ dùng topic riêng để launch manager cũ không chạy nhầm map
mặc định khi chưa hiểu trường `map_name`.

## 1. Lấy danh sách bản đồ

Khi mở một trong hai hộp thoại hoặc nhấn **Tải lại danh sách**, giao diện gửi:

```json
{
  "action": "list",
  "target_machine": "cuong",
  "request_id": "map_001"
}
```

Robot đọc thư mục bản đồ của chính nó rồi trả về `/hmi/map_list`:

```json
{
  "event": "map_list",
  "machine_name": "cuong",
  "request_id": "map_001",
  "maps": [
    { "name": "Sân thử nghiệm 01" },
    { "name": "Khu nhà A" }
  ]
}
```

`maps: []` nghĩa là robot đã trả lời nhưng chưa có bản đồ. Khi không đọc được
thư mục, trả cùng `request_id`, `maps: []` và `error` là thông báo lỗi.
Giao diện chỉ nhận câu trả lời đúng máy và đúng yêu cầu; không nhận được phản
hồi trong 8 giây thì báo lỗi và cho tải lại. Chỉ các bộ file bản đồ hoàn chỉnh,
có YAML và ảnh được YAML tham chiếu tới, mới được đưa vào danh sách.

## 2. Lưu bản đồ có tên

Sau khi người dùng nhập tên và nhấn **Lưu bản đồ**, giao diện gửi:

```json
{
  "source": "hmi_web",
  "target_machine": "cuong",
  "action": "start",
  "launch": "save_aloam_2d_map",
  "map_name": "Sân thử nghiệm 01",
  "request_id": "map_002",
  "timestamp": 1790000000000
}
```

Tên được bỏ khoảng trắng đầu/cuối và chuẩn hóa Unicode NFC. Tên dài 1–80 ký tự,
bắt đầu bằng chữ hoặc số, chỉ gồm chữ, số, dấu cách, `_` và `-`; không có đuôi file.
Giao diện từ chối tên đã có trong danh sách vừa lấy. Robot vẫn phải tự kiểm tra
lại tên và từ chối ghi đè, vì dữ liệu có thể thay đổi sau khi lấy danh sách.

Phía robot cần chuyển `map_name` thành `output_prefix` nằm trong thư mục bản đồ,
ví dụ để launch hiện có tạo `Sân thử nghiệm 01.yaml` và `Sân thử nghiệm 01.pgm`:

```text
roslaunch export_2d_map save_aloam_2d_map.launch output_prefix:=<thư mục bản đồ>/Sân thử nghiệm 01
```

Truyền từng đối số bằng danh sách argv, giữ toàn bộ `output_prefix:=...` trong
một đối số để hỗ trợ tên có dấu cách. Không ghép tên người dùng vào shell.
Robot trả `event: "saving"` khi chấp nhận và `event: "saved"` sau khi xác nhận
cả hai file đã lưu xong; không báo lưu thành công chỉ dựa vào việc khởi tạo process.

## 3. Chạy bản đồ đã chọn

Người dùng chọn một tên trong danh sách rồi nhấn **Launch**. Giao diện gửi:

```json
{
  "source": "hmi_web",
  "target_machine": "cuong",
  "action": "start",
  "launch": "helios_raw_to_map",
  "map_name": "Sân thử nghiệm 01",
  "request_id": "map_003",
  "timestamp": 1790000000000
}
```

Robot tìm file YAML tương ứng trong thư mục của nó, kiểm tra file vẫn tồn tại,
rồi truyền đường dẫn đó vào node nạp bản đồ trong `helios_raw_to_map.launch`.
Launch này nằm ở robot và chưa được chỉnh sửa trong thay đổi giao diện này.

Nếu bổ sung một launch argument tên `map_file`, lệnh dự kiến sau khi sửa launch là:

```text
roslaunch rslidar_sdk helios_raw_to_map.launch map_file:=<đường dẫn YAML trên robot>
```

Phải nối argument đó vào node `map_server` hoặc node nạp map thực tế đang có.
Không thêm một node thứ hai cùng xuất `/map`. Nếu tác vụ đang chạy với bản đồ
khác, robot nên trả lỗi yêu cầu STOP trước khi đổi map.

## 4. Trạng thái và dừng

Mỗi phản hồi trạng thái gửi về `/hmi/launch_status` cần gồm:

```json
{
  "source": "hmi_map_manager",
  "machine_name": "cuong",
  "launch": "save_aloam_2d_map",
  "map_name": "Sân thử nghiệm 01",
  "request_id": "map_002",
  "event": "saved"
}
```

| `event` | Ý nghĩa |
| --- | --- |
| `saving` | Đã nhận yêu cầu và đang lưu |
| `saved` | Đã lưu đủ bộ file thành công |
| `started` | Đã khởi chạy với bản đồ được chọn |
| `already_running` | Tác vụ đã chạy với chính bản đồ này |
| `rejected` | Từ chối yêu cầu; thêm trường `message` mô tả lý do |
| `save_failed`, `start_failed` | Lưu hoặc khởi chạy thất bại; thêm `message` |
| `stopped`, `not_running` | Đã dừng hoặc tác vụ chưa chạy |
| `exited` | Process kết thúc; thêm `return_code` |

Sau khi gửi yêu cầu bắt đầu, hộp thoại chờ robot xác nhận tối đa 8 giây. Nếu
robot chấp nhận, hộp thoại đóng và tiến độ hiển thị tại hàng tác vụ. Nếu robot
từ chối, thông báo hiện trong hộp thoại. Hết thời gian chờ không đồng nghĩa
robot chưa chạy: người dùng được nhắc kiểm tra trạng thái trước khi gửi lại.

Nút STOP gửi tới `/hmi/map_command` với `action: "stop"`, tên `launch`,
`target_machine`, `request_id` và `timestamp`; không cần `map_name`.
Robot cần dừng process đang quản lý và không đưa map lưu dở vào danh sách.

Do giao diện có thể kết nối nhiều rosbridge, cùng một yêu cầu có thể tới robot
hơn một lần. Phía robot phải bỏ qua `request_id` đã xử lý để tránh khởi chạy trùng.

Công tắc vật lý đi qua giao diện cũng mở hộp nhập/chọn map khi bật tác vụ bản đồ.
Giữ `forward_command_on_toggle=false` ở GPIO bridge để tránh tự phát lệnh cũ
không có `map_name` trong khi người dùng chưa chọn xong.

## Cấu trúc hai file launch cần ghép sau trên robot

Các ví dụ sau là cấu trúc tham khảo để ghép vào file thật trên robot; chưa chỉnh
sửa workspace của robot. UI gửi `map_name` trong JSON, không trực tiếp chạy
roslaunch. Node xử lý trên robot mới đổi tên đó thành đường dẫn và chạy lệnh.

### `save_aloam_2d_map.launch`

Launch lưu nhận **đường dẫn không có đuôi file** qua `output_prefix`, rồi truyền
vào private parameter của script xuất map:

```xml
<launch>
  <!-- Bắt buộc robot truyền đường dẫn theo tên vừa nhập trên giao diện. -->
  <arg name="output_prefix" />
  <arg name="topic" default="/laser_cloud_map" />
  <arg name="once" default="true" />

  <node pkg="export_2d_map"
        type="export_2d_map_from_cloud.py"
        name="save_aloam_2d_map"
        output="screen"
        required="true">
    <param name="topic" value="$(arg topic)" />
    <param name="output_prefix" value="$(arg output_prefix)" />
    <param name="once" value="$(arg once)" />
    <!-- Giữ các param resolution, z_min/z_max... trong file thật nếu đang dùng. -->
  </node>
</launch>
```

Ví dụ người dùng nhập `san_A`, robot chạy:

```bash
roslaunch export_2d_map save_aloam_2d_map.launch output_prefix:=/home/cuong/maps/san_A
```

Script xuất map cần dùng `~output_prefix` để tạo **cùng bộ**
`/home/cuong/maps/san_A.yaml` và `/home/cuong/maps/san_A.pgm`; nội dung YAML
phải có `image: san_A.pgm`. Khi `once=true`, script kết thúc sau khi lưu xong.
`required=true` giúp roslaunch kết thúc cùng node lưu; backend vẫn kiểm tra
kết quả và sự tồn tại của cả hai file trước khi báo `saved`.

### `helios_raw_to_map.launch`

Nếu file thật đang dùng `map_server`, bổ sung argument `map_file` ở cấp launch
và sửa **node map_server đang có** để đọc argument này. Phần liên quan có dạng:

```xml
<launch>
  <!-- Đường dẫn YAML do robot lấy từ map_name đã chọn trên giao diện. -->
  <arg name="map_file" />

  <!-- Giữ nguyên các node LiDAR, chuyển đổi dữ liệu, định vị... đang có. -->

  <!-- Đây là node map_server hiện có, không tạo thêm một node xuất /map. -->
  <node pkg="map_server"
        type="map_server"
        name="map_server"
        args="&quot;$(arg map_file)&quot;"
        output="screen" />
</launch>
```

Ví dụ người dùng chọn `san_A`, robot chạy:

```bash
roslaunch rslidar_sdk helios_raw_to_map.launch map_file:=/home/cuong/maps/san_A.yaml
```

`map_server` đọc YAML để lấy đường dẫn ảnh, độ phân giải và gốc tọa độ rồi
phát bản đồ. Các node định vị/điều hướng trong launch phải sử dụng bản đồ đó.
Nếu `/map` do một node tự xây bản đồ phát ra, cần xem và sửa đúng node đó để
hỗ trợ nạp map lưu sẵn; chỉ khai báo thêm `map_file` sẽ chưa đủ.

`/home/cuong/maps` trong các ví dụ chỉ là thư mục minh họa. Node robot phải
dùng cùng một thư mục thực tế khi lưu, liệt kê và chạy bản đồ.
