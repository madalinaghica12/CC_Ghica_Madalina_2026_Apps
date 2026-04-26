const path = require('path');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ✅ API endpoint
app.get('/api/data', (req, res) => {
    fs.readFile('data.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Cannot read file' });
        }
        res.json(JSON.parse(data));
    });
});

// ✅ Frontend (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
