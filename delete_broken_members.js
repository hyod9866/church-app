import sqlite3

db = sqlite3.Database('./church.db')

def is_broken(text):
    if not text: return False
    # Check for replacement character
    if '\uFFFD' in text: return True
    # Check for common patterns in mis-decoded text
    # Mis-decoded UTF-8 as EUC-KR often results in certain Hanja or unusual characters
    broken_chars = ['繹', '쏙', '㎗', '醫', '占', '쏙', '옙', '源', '泥', '싔']
    for char in broken_chars:
        if char in text: return True
    return False

db.all('SELECT id, name FROM members', [], (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    
    const idsToDelete = rows.filter(r => is_broken(r.name)).map(r => r.id);
    console.log(`Total members: ${rows.length}`);
    console.log(`Broken members to delete: ${idsToDelete.length}`);
    
    if (idsToDelete.length === 0) {
        console.log('No broken members found.');
        return;
    }
    
    const placeholders = idsToDelete.map(() => '?').join(',');
    db.run(`DELETE FROM members WHERE id IN (${placeholders})`, idsToDelete, function(err) {
        if (err) {
            console.error('Delete error:', err.message);
        } else {
            console.log(`Successfully deleted ${this.changes} broken members.`);
        }
    });
});
