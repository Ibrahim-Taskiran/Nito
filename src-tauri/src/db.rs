use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::{Map, Number, Value};

pub fn to_sql(v: &Value) -> Result<SqlValue, String> {
    Ok(match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                if f.fract() == 0.0 && f.abs() < 9.0e15 {
                    SqlValue::Integer(f as i64)
                } else {
                    SqlValue::Real(f)
                }
            } else {
                return Err("Unsupported number".into());
            }
        }
        Value::String(s) => SqlValue::Text(s.clone()),
        _ => return Err("Unsupported parameter type".into()),
    })
}

fn from_ref(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::Array(b.iter().map(|x| Value::Number((*x).into())).collect()),
    }
}

pub fn run(conn: &Connection, sql: &str, params: &[Value]) -> Result<(i64, usize), String> {
    let ps: Vec<SqlValue> = params.iter().map(to_sql).collect::<Result<_, _>>()?;
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let changes = stmt.execute(params_from_iter(ps)).map_err(|e| e.to_string())?;
    Ok((conn.last_insert_rowid(), changes))
}

pub fn all(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let ps: Vec<SqlValue> = params.iter().map(to_sql).collect::<Result<_, _>>()?;
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(params_from_iter(ps)).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut m = Map::new();
        for (i, c) in cols.iter().enumerate() {
            let v = row.get_ref(i).map_err(|e| e.to_string())?;
            m.insert(c.clone(), from_ref(v));
        }
        out.push(m);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn roundtrip() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE t(id INTEGER PRIMARY KEY, a TEXT, b REAL)").unwrap();
        let (id, ch) = run(&c, "INSERT INTO t(a,b) VALUES(?,?)", &[json!("x"), json!(1.5)]).unwrap();
        assert_eq!((id, ch), (1, 1));
        let r = all(&c, "SELECT * FROM t WHERE id=?", &[json!(1)]).unwrap();
        assert_eq!(r[0]["a"], json!("x"));
        let p = all(&c, "PRAGMA user_version", &[]).unwrap();
        assert_eq!(p[0]["user_version"], json!(0));
    }
}
