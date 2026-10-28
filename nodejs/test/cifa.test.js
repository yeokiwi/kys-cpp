// Tests of the JavaScript Cifa interpreter used for the event scripts.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Cifa } from '../public/js/Cifa.js';
import { csprintf } from '../public/js/csprintf.js';

async function run(src, setup) {
    const c = new Cifa();
    c.set_output_error(false);
    if (setup) {
        setup(c);
    }
    const r = await c.run_script(src);
    return { r, c };
}

test('arithmetic and precedence', async () => {
    assert.equal((await run('return 5+4*9*(2+3)/23;')).r, 5 + (4 * 9 * 5) / 23);
    assert.equal((await run('return 7 % 3 + (1 << 4) - (5 & 3);')).r, 1 + 16 - 1);
    assert.equal((await run('return 2 > 1 && 3 < 2 || 1;')).r, 1);
});

test('loops and blocks', async () => {
    const src = `int sum = 1;
for (int i = 1; i <= 10; i++) { for (int j = 1; j <= 10; j++) { int x = 0; if ((i + j) % 2 == 0) { x = -1; } else x = 1; sum += (i * j) * x; } }
return sum;`;
    assert.equal((await run(src)).r, -24);
    assert.equal((await run('int i = 0; do { i += 2; } while (i < 7); return i;')).r, 8);
    assert.equal((await run('int i = 0; while (1) { i++; if (i > 5) break; } return i;')).r, 6);
});

test('goto and labels', async () => {
    assert.equal((await run('int value = 0;\nagain:\nvalue += 1;\nif (value < 3) goto again;\nreturn value;')).r, 3);
    const src = `x = 0;
{ if (x == 0) goto out; x = 5; }
out:
return x + 1;`;
    assert.equal((await run(src)).r, 1);
});

test('switch with fall through and blocks', async () => {
    const src = `y = 0;
switch (2) {
case 1: { y = 1; break; }
case 2: { y = 2; }
case 3: { y = y * 10; break; }
default: break;
}
return y;`;
    assert.equal((await run(src)).r, 20);
    assert.equal((await run('y = 0; switch (9) { case 1: y = 1; break; default: y = 7; } return y;')).r, 7);
});

test('arrays, maps and value semantics', async () => {
    assert.equal((await run('a = {1, 2, 3}; b = a; b[0] = 10; return a[0] + b[0] + size(a);')).r, 1 + 10 + 3);
    assert.equal((await run('strs = {}; for (int i = 1; i <= 3; i++) { strs[i] = i * 2; } return size(strs);')).r, 4);
    assert.equal((await run('m["a"] = 1; m["b"] = 2; k = m.keys(); return size(m) * 10 + size(k);')).r, 22);
    assert.equal((await run('a = {}; a.push_back(1, 2); a.insert(0, 5); a.erase(1); return a[0] * 10 + a[1];')).r, 52);
});

test('strings and builtins', async () => {
    assert.equal((await run('return "ab" + "cd";')).r, 'abcd');
    assert.equal((await run('return sprintf("%-4s|%03d|%x|%.2f", "a", 7, 255, 3.14159);')).r, 'a   |007|ff|3.14');
    assert.equal((await run('return to_string(3.14159265) + to_string(100);')).r, '3.14159100');
    assert.equal((await run('return format("{}-{1}", 1, 2.5);')).r, '1-2.5');
});

test('script functions with overloads and globals', async () => {
    const src = `b = 304;
add_one_to_b() { b = b + 1; return b; }
label() { return "empty"; }
label(v) { return "one"; }
r = add_one_to_b();
return r + b + size(label(1));`;
    assert.equal((await run(src)).r, 305 + 305 + 3);
    assert.equal((await run('f(n) { if (n <= 1) return 1; return n * f(n - 1); } return f(5);')).r, 120);
});

test('async host functions and exit', async () => {
    const calls = [];
    const { r } = await run('talk("hi", 1); x[3] = wait(5) + 1; if (x[3] == 6) exit(); talk("never");', (c) => {
        c.register_vector('x', new Array(16).fill(0));
        c.register_function('talk', async (a) => {
            calls.push(a[0]);
            await new Promise((res) => setTimeout(res, 1));
        });
        c.register_function('wait', async (a) => a[0]);
    });
    assert.equal(r, undefined);
    assert.deepEqual(calls, ['hi']);
});

test('errors are reported, not thrown', async () => {
    const { r, c } = await run('return undefined_var + 1;');
    assert.ok(r && r.error);
    assert.ok(c.has_error());
    const s = await run('if (1 { }');
    assert.ok(s.r && s.r.error);
});

test('trans50 style generated code', async () => {
    const src = `x[1] = 3;
if (!(x[1] == 3)) {
x[2] = 1;
}
strs = {}; for (int i = 1; i <= 2; i++) { strs[i] = x[x[10 + i - 1]]; } x[5] = menu(0, 0, strs, 2);
switch (x[1]) {
case 3: { x[6] = sprintf(x[7], 12); break; }
default: break;
}
return x[2] * 100 + x[5];`;
    const { r } = await run(src, (c) => {
        const x = new Array(0x10000).fill(0);
        x[7] = 'n=%d';
        x[10] = 7;
        x[11] = 7;
        c.register_vector('x', x);
        c.register_function('menu', (a) => (Array.isArray(a[2]) ? a[3] : -1));
    });
    assert.equal(r, 2);
});

test('csprintf', () => {
    assert.equal(csprintf('%5.1f%%', [12.345]), ' 12.3%');
    assert.equal(csprintf('%-*s', [5, 'x']), '%-*s');
    assert.equal(csprintf('%g %g', [0.0001, 123456789]), '0.0001 1.23457e+08');
});
