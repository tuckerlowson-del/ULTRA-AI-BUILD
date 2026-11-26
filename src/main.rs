slint::include_modules!();

mod app;

fn main() {
    // Use Slint software rendering for compatibility with older Intel graphics.
    // This avoids requiring a working OpenGL driver on low-end Windows PCs.
    #[cfg(windows)]
    std::env::set_var("SLINT_BACKEND", "winit-software");
    app::run();
}
