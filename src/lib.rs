slint::include_modules!();

mod app;

#[no_mangle]
pub extern "C" fn slint_main() {
    app::run();
}
