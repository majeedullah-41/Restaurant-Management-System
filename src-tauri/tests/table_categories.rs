use rms_lib::db;
use std::env;
use std::fs;

#[test]
fn test_table_categories_and_bulk_add() {
    let db_path = "backend_table_cat_test.db";
    env::set_var("DB_PATH", db_path);
    let _ = fs::remove_file(db_path);

    db::init_shared_connection();
    db::init_db().unwrap();
    db::init_tables_if_needed().unwrap();

    // No categories initially
    let cats = db::get_table_categories().expect("Failed to fetch categories");
    assert_eq!(cats.len(), 0, "Expected no categories at start");

    // Add categories (duplicate name rejected)
    db::add_table_category("Indoor".to_string()).expect("Failed to add category");
    assert!(db::add_table_category("Indoor".to_string()).is_err());
    let cats = db::get_table_categories().expect("ok");
    assert_eq!(cats.len(), 1, "Expected 1 category");
    let indoor = cats.into_iter().next().unwrap();

    // Add categories (duplicate name rejected)

    db::add_tables(indoor.id, "11-13,15".to_string()).expect("Failed to add tables");

    let tables = db::get_detailed_table_statuses().expect("Failed to fetch tables");
    let indoor_tables: Vec<_> = tables.iter().filter(|t| t.category_name.as_deref() == Some("Indoor")).collect();
    assert_eq!(indoor_tables.len(), 4, "Expected 4 tables in Indoor (11,12,13,15), got {}", indoor_tables.len());

    // Duplicate numbers are skipped or fail
    let res = db::add_tables(indoor.id, "11".to_string());
    println!("Res is {:?}", res);
    assert!(res.is_err(), "Expected failure due to duplicate");

    // Deleting a category still in use is blocked
    let res = db::delete_table_category(indoor.id);
    assert!(res.is_err());
    assert!(res.unwrap_err().to_lowercase().contains("tables"));

    // Move tables out, then deletion succeeds
    {
        let conn = db::get_conn().unwrap();
        conn.execute("UPDATE table_status SET category_id = NULL WHERE category_id = ?1", [&indoor.id]).unwrap();
    }
    db::delete_table_category(indoor.id).expect("Should delete after clearing tables");

    // add_table honors category; rename works
    db::add_table_category("Patio".to_string()).expect("ok");
    let patio = db::get_table_categories().expect("ok").into_iter().find(|c| c.name == "Patio").unwrap();
    db::add_tables(patio.id, "99".to_string()).expect("Failed add_table with category");
    let tables = db::get_detailed_table_statuses().expect("ok");
    let t99 = tables.iter().find(|t| t.table_number == 99).unwrap();
    assert_eq!(t99.category_name.as_deref(), Some("Patio"));

    db::update_table_category(patio.id, "Terrace".to_string()).expect("Failed to rename");
    let cats = db::get_table_categories().expect("ok");
    assert!(cats.iter().any(|c| c.name == "Terrace" && c.id == patio.id));

    let _ = fs::remove_file(db_path);
}
