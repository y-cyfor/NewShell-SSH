use std::net::TcpStream;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

struct ServerProcess(Mutex<Option<Child>>);

const SERVER_PORT: u16 = 29800;

fn is_port_in_use(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(300),
    )
    .is_ok()
}

fn kill_process_on_port(port: u16) {
    // Windows: use netstat to find PID, verify process name, then taskkill
    let output = Command::new("cmd")
        .args(&["/C", &format!(
            "for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{} ^| findstr LISTENING') do (\
             for /f \"tokens=1\" %b in ('tasklist /FI \"PID eq %a\" /NH') do (\
             if /i \"%b\"==\"newshell-server.exe\" taskkill /F /PID %a 2>nul))",
            port
        )])
        .output();

    match output {
        Ok(_) => println!("[NewShell] Attempted to kill newshell-server.exe on port {}", port),
        Err(e) => println!("[NewShell] Failed to kill process on port {}: {}", port, e),
    }

    // Wait a bit for the port to be released
    std::thread::sleep(Duration::from_millis(500));
}

fn find_server_binary(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // 1. Dev mode: project_root/server/newshell-server.exe
    if cfg!(debug_assertions) {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent().unwrap();
        let dev_path = project_root.join("server").join("newshell-server.exe");
        if dev_path.exists() {
            return Some(dev_path);
        }
        return None;
    }

    // 2. Release: same directory as the exe
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let sibling = exe_dir.join("newshell-server.exe");
            if sibling.exists() {
                return Some(sibling);
            }

            // 3. Release: resources/server/ relative to exe
            let resource_sub = exe_dir
                .join("resources")
                .join("server")
                .join("newshell-server.exe");
            if resource_sub.exists() {
                return Some(resource_sub);
            }
        }
    }

    // 4. Tauri resource dir
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("server").join("newshell-server.exe");
        if bundled.exists() {
            return Some(bundled);
        }
    }

    None
}

fn start_server(app: &tauri::AppHandle) -> Option<Child> {
    // If port is in use, kill the old process first
    if is_port_in_use(SERVER_PORT) {
        println!(
            "[NewShell] Port {} already in use, killing old process...",
            SERVER_PORT
        );
        kill_process_on_port(SERVER_PORT);
    }

    let server_path = find_server_binary(app)?;

    println!("[NewShell] Starting backend from: {:?}", server_path);

    match Command::new(&server_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(child) => {
            println!("[NewShell] Backend started on port {}", SERVER_PORT);
            Some(child)
        }
        Err(e) => {
            println!("[NewShell] Failed to start backend: {}", e);
            None
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let child = start_server(app.handle());
            app.manage(ServerProcess(Mutex::new(child)));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<ServerProcess>();
                let mut child = state.0.lock().unwrap();
                if let Some(ref mut c) = child.take() {
                    let _ = c.kill();
                    println!("[NewShell] Backend process killed.");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
