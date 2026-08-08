use rms_lib::db;
use std::env;
use std::fs;

// Note: this file is a separate test binary from integration.rs, so it runs in
// its own process and has its own database connection.
#[test]
fn test_auth_flow_and_admin_override() {
    let db_path = "backend_test_auth.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(format!("{}-wal", db_path));
    let _ = fs::remove_file(format!("{}-shm", db_path));

    db::init_shared_connection();
    db::init_db().unwrap();

    // 1. Cashier login issues a valid session token
    let res = db::login("cashier@restaurant.com".into(), "password".into());
    assert!(res.success, "cashier login should succeed");
    let cashier_token = res.session_token.expect("cashier should receive a session token");
    assert!(!cashier_token.is_empty());

    // 2. The session token resolves to the current user
    let current = db::get_current_session(cashier_token.clone())
        .expect("get_current_session should not error");
    let current = current.expect("session should resolve to a user");
    assert_eq!(current.username, "cashier@restaurant.com");
    assert_eq!(current.role, "Cashier");
    assert!(current.must_change_password, "seeded cashier must change password on first login");

    // 3. A cashier must NOT be able to override another user's profile
    let err = db::update_user_profile(
        cashier_token.clone(),
        "admin@restaurant.com".to_string(),
        "admin@restaurant.com".to_string(),
        None,
        Some("pwned123".to_string()),
        Some(true),
        None,
        None,
    )
    .unwrap_err();
    assert!(
        err.contains("Only an Administrator"),
        "cashier must not override admin profile, got: {}",
        err
    );

    // 4. A cashier must NOT be able to change roles
    let err = db::update_user_profile(
        cashier_token.clone(),
        "cashier@restaurant.com".to_string(),
        "cashier@restaurant.com".to_string(),
        Some("password".to_string()),
        None,
        Some(false),
        None,
        Some("Admin".to_string()),
    )
    .unwrap_err();
    assert!(
        err.contains("Only an Administrator"),
        "cashier must not change roles, got: {}",
        err
    );

    // 4b. A cashier must NOT be able to touch another user's record even when
    //     the request carries no password / override / role (defense in depth).
    let err = db::update_user_profile(
        cashier_token.clone(),
        "admin@restaurant.com".to_string(),
        "admin@restaurant.com".to_string(),
        None,
        None,
        Some(false),
        Some("Hijacked".to_string()),
        None,
    )
    .unwrap_err();
    assert!(
        err.contains("Only an Administrator"),
        "cashier must not modify another user's profile, got: {}",
        err
    );

    // 4c. A cashier must NOT be able to plant a security question on another
    //     user's account (would enable forgot-password account hijacking).
    let err = db::update_security_question(
        cashier_token.clone(),
        "admin@restaurant.com".to_string(),
        "What is your pet's name?".to_string(),
        "pwned".to_string(),
    )
    .unwrap_err();
    assert!(
        err.contains("Only the account owner"),
        "cashier must not set another user's security question, got: {}",
        err
    );

    // 4d. A cashier CAN set their own security question.
    db::update_security_question(
        cashier_token.clone(),
        "cashier@restaurant.com".to_string(),
        "What is your pet's name?".to_string(),
        "rexrexrex".to_string(),
    )
    .expect("cashier should set their own security question");

    // 4e. The planted question answers to the forgot-password flow.
    db::reset_password_with_security_answer(
        "cashier@restaurant.com".to_string(),
        "rexrexrex".to_string(),
        "changed-by-recovery".to_string(),
    )
    .expect("forgot-password flow should succeed with the correct answer");

    let recovery_login = db::login("cashier@restaurant.com".into(), "changed-by-recovery".into());
    assert!(recovery_login.success, "recovered password should log in");
    db::logout(recovery_login.session_token.unwrap()).unwrap();

    // Restore the original password so the remaining assertions stay consistent.
    db::reset_password_with_security_answer(
        "cashier@restaurant.com".to_string(),
        "rexrexrex".to_string(),
        "password".to_string(),
    )
    .expect("should restore the original password");

    // 5. A cashier can update their own profile (password + display name)
    db::update_user_profile(
        cashier_token.clone(),
        "cashier@restaurant.com".to_string(),
        "cashier@restaurant.com".to_string(),
        Some("password".to_string()),
        Some("newpass123".to_string()),
        Some(false),
        Some("Cashier One".to_string()),
        None,
    )
    .expect("cashier should update their own profile");

    // must_change_password is cleared after a self password change
    let current = db::get_current_session(cashier_token.clone())
        .unwrap()
        .unwrap();
    assert!(!current.must_change_password, "password change should clear the flag");
    assert_eq!(current.display_name.as_deref(), Some("Cashier One"));

    // 6. Admin login + admin can override another user
    let admin_res = db::login("admin@restaurant.com".into(), "password".into());
    assert!(admin_res.success);
    let admin_token = admin_res.session_token.unwrap();

    db::update_user_profile(
        admin_token.clone(),
        "admin@restaurant.com".to_string(),
        "admin@restaurant.com".to_string(),
        Some("password".to_string()),
        Some("strong-admin-password".to_string()),
        Some(false),
        Some("The Boss".to_string()),
        None,
    )
    .expect("admin should update their own profile");

    // 7. Logout invalidates the token
    db::logout(cashier_token.clone()).unwrap();
    assert!(
        db::get_current_session(cashier_token).unwrap().is_none(),
        "token should be invalid after logout"
    );

    // 8. Invalid login is rejected and yields no session token
    let bad = db::login("admin@restaurant.com".into(), "wrongpassword".into());
    assert!(!bad.success);
    assert!(bad.session_token.is_none());

    db::logout(admin_token).unwrap();
    let _ = fs::remove_file(db_path);
    let _ = fs::remove_file(format!("{}-wal", db_path));
    let _ = fs::remove_file(format!("{}-shm", db_path));
}
