import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const OBSIDIAN_VAULT_NAME = 'KHG';
const OBSIDIAN_SERMON_DIR = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG\\01 내 설교';

function walk(dir) {
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        for (const item of list) {
            const p = path.join(dir, item);
            const stat = fs.statSync(p);
            if (stat.isDirectory()) results = results.concat(walk(p));
            else if (item.endsWith('.md')) results.push(p);
        }
    } catch (e) {
        console.warn('Walk error:', e.message);
    }
    return results;
}

async function syncAll() {
    console.log(`🔍 Scanning Obsidian vault from: ${OBSIDIAN_SERMON_DIR}`);
    const files = walk(OBSIDIAN_SERMON_DIR);
    console.log(`📄 Found ${files.length} markdown sermon files.`);

    let syncedCount = 0;
    let matchedCount = 0;

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            let meta = {};
            let curKey = null;

            if (fmMatch) {
                for (const line of fmMatch[1].split(/\r?\n/)) {
                    const kv = line.match(/^([\w가-힣,_\s]+):\s*(.*)$/);
                    if (kv) {
                        curKey = kv[1].trim();
                        meta[curKey] = kv[2].trim();
                    } else if (line.trim().startsWith('-') && curKey) {
                        if (!Array.isArray(meta[curKey])) {
                            meta[curKey] = meta[curKey] ? [meta[curKey]] : [];
                        }
                        meta[curKey].push(line.trim().replace(/^-\s*/, ''));
                    }
                }
            }

            const base = path.basename(file, '.md');
            let date = meta['날짜'] || '';
            if (!date) {
                const m = base.match(/(202\d)[\.\-_](\d{1,2})[\.\-_](\d{1,2})/);
                if (m) date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            }
            if (typeof date === 'string') {
                date = date.replace(/\./g, '-').trim();
            }

            let bible = meta['본문'] || '';
            let title = base;
            const titleMatch = base.match(/^(\d+\s+)?([가-힣]+)\s*(\d+[\d_\-~:]*)(\s+[a-z]+)?\s*(.*)$/i);
            if (titleMatch) {
                if (!bible && titleMatch[2] && titleMatch[3]) {
                    bible = `${titleMatch[2]} ${titleMatch[3].replace(/_/g, ':')}`;
                }
                if (titleMatch[5]) {
                    title = titleMatch[5].replace(/\.(202\d)[\.\-_].*$/, '').replace(/\.md$/, '').trim();
                }
            }

            const vaultRoot = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG';
            const relPath = path.relative(vaultRoot, file).replace(/\\/g, '/');
            const obsidianUri = `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT_NAME)}&file=${encodeURIComponent(relPath)}`;

            if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
                const { data: meetingsOnDate } = await supabase
                    .from('meetings')
                    .select('id, title, sermon_title, memo, date, church')
                    .eq('date', date);

                if (meetingsOnDate && meetingsOnDate.length > 0) {
                    const cleanFileName = base.trim();
                    const existing = meetingsOnDate.find(m => {
                        const st = (m.sermon_title || '').trim();
                        const tt = (m.title || '').trim();
                        if (st && (cleanFileName.includes(st) || st.includes(cleanFileName) || st.includes(title) || title.includes(st))) return true;
                        if (tt && (tt.includes(title) || title.includes(tt))) return true;
                        if (meta['비고'] && (m.church === meta['비고'] || tt.includes(meta['비고']))) return true;
                        return false;
                    });

                    if (existing) {
                        const currentMemo = existing.memo || '';
                        const updatedMemo = currentMemo.includes('[obsidian:')
                            ? currentMemo.replace(/\[obsidian:.*?\]/, `[obsidian:${obsidianUri}]`)
                            : `${currentMemo}\n[obsidian:${obsidianUri}]`.trim();

                        await supabase
                            .from('meetings')
                            .update({
                                sermon_title: existing.sermon_title || title,
                                memo: updatedMemo
                            })
                            .eq('id', existing.id);
                        matchedCount++;
                        console.log(`✅ Synced with Meeting #${existing.id} [${date}]: ${base}`);
                    }
                }
                syncedCount++;
            }
        } catch (err) {
            console.warn('Error processing file:', file, err.message);
        }
    }

    console.log(`\n🎉 Finished! Processed with date: ${syncedCount}, Matched & Updated in PMP DB: ${matchedCount}`);
}

syncAll();
