// Save slots, compatible with Save.cpp / NewSave.cpp of the C++ version:
//   zip_save = 1: save/<n>.zip containing 1.db (SQLite, "R" data), s1.grp, d1.grp
//   zip_save = 0: save/<n>.db + save/s<n>.grp + save/d<n>.grp
//   slot 0 (new game): save/0.db + save/allsin.grp + save/alldef.grp
// The browser exchanges the data as JSON: every table is { columns: [[name, type]], rows: [[...]] }.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ZipReader, writeZip } from './zip.js';

export const TABLES = ['base', 'bag', 'role', 'item', 'submap', 'magic', 'shop'];

function quoteIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
}

function tempDbFile() {
    return path.join(os.tmpdir(), `kys-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function readTables(db) {
    const result = {};
    for (const table of TABLES) {
        try {
            const stmt = db.prepare(`select * from ${quoteIdent(table)}`);
            const columns = stmt.columns().map((c) => c.name);
            stmt.setReturnArrays?.(true);
            let rows = stmt.all();
            if (rows.length && !Array.isArray(rows[0])) {
                rows = rows.map((r) => columns.map((c) => r[c]));
            }
            result[table] = {
                columns: columns.map((c) => [c, '']),
                rows: rows.map((r) => r.map((v) => (typeof v === 'bigint' ? Number(v) : v))),
            };
        } catch (e) {
            console.log(`Failed to read table ${table}: ${e.message}`);
        }
    }
    return result;
}

function writeTable(db, table, data) {
    if (!data || !Array.isArray(data.columns)) {
        return;
    }
    db.exec(`drop table if exists ${quoteIdent(table)}`);
    const cols = data.columns.map(([n, t]) => `${quoteIdent(n)} ${t === 'text' ? 'text' : 'integer'}`).join(',');
    db.exec(`create table ${quoteIdent(table)}(${cols})`);
    const insert = db.prepare(`insert into ${quoteIdent(table)} values(${data.columns.map(() => '?').join(',')})`);
    for (const row of data.rows || []) {
        insert.run(...data.columns.map(([, t], i) => {
            const v = row[i];
            if (t === 'text') {
                return v == null ? '' : String(v);
            }
            const n = Math.trunc(Number(v));
            return Number.isFinite(n) ? n : 0;
        }));
    }
}

function writeTables(db, tables) {
    db.exec('begin');
    try {
        for (const table of TABLES) {
            writeTable(db, table, tables[table]);
        }
        db.exec('commit');
    } catch (e) {
        db.exec('rollback');
        throw e;
    }
}

export class SaveStore {
    constructor(saveDir) {
        this.saveDir = saveDir;
    }

    file(num, c) {
        const dir = this.saveDir;
        if (c === 'z') {
            return path.join(dir, `${num}.zip`);
        }
        if (num > 0) {
            return c === 'r' ? path.join(dir, `${num}.db`) : path.join(dir, `${c}${num}.grp`);
        }
        if (c === 'r') {
            return path.join(dir, '0.db');
        }
        return path.join(dir, c === 's' ? 'allsin.grp' : 'alldef.grp');
    }

    exists(num, zipSave = true) {
        return (zipSave && fs.existsSync(this.file(num, 'z')))
            || (fs.existsSync(this.file(num, 'r')) && fs.existsSync(this.file(num, 's')) && fs.existsSync(this.file(num, 'd')));
    }

    list(max, zipSave) {
        const result = [];
        for (let i = 0; i <= max; i++) {
            let mtime = 0;
            if (this.exists(i, zipSave)) {
                for (const c of ['z', 'r']) {
                    try {
                        mtime = Math.max(mtime, fs.statSync(this.file(i, c)).mtimeMs);
                    } catch {
                        // ignore missing files
                    }
                }
                result.push({ slot: i, mtime });
            }
        }
        return result;
    }

    load(num, zipSave = true) {
        if (!this.exists(num, zipSave)) {
            return null;
        }
        let zip = null;
        if (zipSave) {
            zip = ZipReader.open(this.file(num, 'z'));
        }
        let dbFile = this.file(num, 'r');
        let tmp = null;
        if (zip) {
            tmp = tempDbFile();
            fs.writeFileSync(tmp, zip.read('1.db') || Buffer.alloc(0));
            dbFile = tmp;
        }
        let tables;
        const db = new DatabaseSync(dbFile, { readOnly: true });
        try {
            tables = readTables(db);
        } finally {
            db.close();
            if (tmp) {
                fs.rmSync(tmp, { force: true });
            }
        }
        let sdata;
        let ddata;
        if (zip) {
            sdata = zip.read('s1.grp');
            ddata = zip.read('d1.grp');
        } else {
            sdata = fs.readFileSync(this.file(num, 's'));
            ddata = fs.readFileSync(this.file(num, 'd'));
        }
        return {
            tables,
            sdata: (sdata || Buffer.alloc(0)).toString('base64'),
            ddata: (ddata || Buffer.alloc(0)).toString('base64'),
            zip: !!zip,
        };
    }

    save(num, data, zipSave = true) {
        fs.mkdirSync(this.saveDir, { recursive: true });
        const sdata = Buffer.from(data.sdata || '', 'base64');
        const ddata = Buffer.from(data.ddata || '', 'base64');
        const dbFile = zipSave ? tempDbFile() : this.file(num, 'r');
        if (!zipSave) {
            fs.rmSync(dbFile, { force: true });
        }
        const db = new DatabaseSync(dbFile);
        try {
            writeTables(db, data.tables || {});
        } finally {
            db.close();
        }
        if (zipSave) {
            const dbContent = fs.readFileSync(dbFile);
            fs.rmSync(dbFile, { force: true });
            writeZip(this.file(num, 'z'), [['s1.grp', sdata], ['d1.grp', ddata], ['1.db', dbContent]]);
        } else {
            fs.writeFileSync(this.file(num, 's'), sdata);
            fs.writeFileSync(this.file(num, 'd'), ddata);
        }
        return true;
    }
}

// Save::runSql: put one table into an in-memory database, run an "update"
// statement on it and return the table again.
export function runSql(table, data, sql) {
    if (!TABLES.includes(table) || typeof sql !== 'string' || !sql.trim().toLowerCase().startsWith('update ')) {
        return null;
    }
    const db = new DatabaseSync(':memory:');
    try {
        writeTable(db, table, data);
        try {
            db.exec(sql);
        } catch (e) {
            console.log(`runsql: ${e.message}`);
        }
        return readTables(db)[table];
    } finally {
        db.close();
    }
}
