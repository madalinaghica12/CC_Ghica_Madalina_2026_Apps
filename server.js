const path = require('path');
const express = require('express');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.get('/api/data', (req, res) => {
    fs.readFile('data.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Cannot read file' });
        }
        res.json(JSON.parse(data));
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
