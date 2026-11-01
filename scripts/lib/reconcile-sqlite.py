#!/usr/bin/env python3
import sqlite3
import json
import sys

def get_table_data(db_path, table, sort_col):
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    rows = [dict(r) for r in cur.execute(f"SELECT * FROM {table} ORDER BY {sort_col}").fetchall()]
    con.close()
    return rows

def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    db1 = sys.argv[1]
    db2 = sys.argv[2]
    
    subs1 = get_table_data(db1, "subscriptions", "id")
    subs2 = get_table_data(db2, "subscriptions", "id")
    
    trades1 = get_table_data(db1, "paper_trades_v3", "id")
    trades2 = get_table_data(db2, "paper_trades_v3", "id")
    
    subs_match = (subs1 == subs2)
    trades_match = (trades1 == trades2)
    
    result = {
        "match": subs_match and trades_match,
        "subsMatch": subs_match,
        "tradesMatch": trades_match,
        "subsCount": len(subs1),
        "tradesCount": len(trades1)
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
