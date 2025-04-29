const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const fetch = require('node-fetch'); // npm install node-fetch@2

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static front-end
app.use(express.static(path.join(__dirname, 'public')));

// Load jobs.csv into memory
const jobs = [];
fs.createReadStream(path.join(__dirname, 'data', 'jobs.csv'))
  .pipe(csv())
  .on('data', row => jobs.push(row))
  .on('end', () => console.log('Loaded jobs.csv'));

// Load roadmap data (JSON keyed by job_title)
const roadmaps = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'roadmaps.json'), 'utf-8')
);

// API: get list of job titles with additional info
app.get('/api/jobs', (req, res) => {
  const jobInfo = jobs.reduce((acc, job) => {
    if (!acc[job.job_title]) {
      acc[job.job_title] = {
        title: job.job_title,
        description: job.job_description || '',
        averageSalary: job.average_salary || 'N/A',
        skills: job.required_skills ? job.required_skills.split(',').map(s => s.trim()) : []
      };
    }
    return acc;
  }, {});
  
  res.json(Object.values(jobInfo));
});

// API: get roadmap for a given title
app.get('/api/roadmap', (req, res) => {
  const title = req.query.title;
  if (!title) {
    return res.status(400).json({ error: 'Job title is required' });
  }

  // Find the job info
  const jobInfo = jobs.find(j => j.job_title.toLowerCase() === title.toLowerCase());
  if (!jobInfo) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Always return the default roadmap (software engineer roadmap)
  const defaultRoadmap = roadmaps['software engineer'];
  
  res.json({
    roadmap: defaultRoadmap,
    jobInfo: {
      title: jobInfo.job_title,
      description: jobInfo.job_description || '',
      averageSalary: jobInfo.average_salary || 'N/A',
      skills: jobInfo.required_skills ? jobInfo.required_skills.split(',').map(s => s.trim()) : []
    }
  });
});

// AI-powered roadmap endpoint (free proxy)
app.get('/api/roadmap/ai', async (req, res) => {
  const title = req.query.title;
  if (!title) return res.status(400).json({ error: 'Job title is required' });

  const prompt = `\nGenerate a detailed, advanced, step-by-step career roadmap for a ${title} in JSON format, with possible branches and labels for each step. Each step should have an id, label, and optionally a next array (with id and label for each branch). Example format:\n[\n  { \"id\": \"A\", \"label\": \"Start\", \"next\": [{ \"id\": \"B\", \"label\": \"Option 1\" }, { \"id\": \"C\", \"label\": \"Option 2\" }] },\n  { \"id\": \"B\", \"label\": \"Step 1\" },\n  { \"id\": \"C\", \"label\": \"Step 2\" }\n]\n`;

  try {
    const response = await fetch('https://api.chatanywhere.com.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    console.log('FULL API RESPONSE:', data); // Log the full response

    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('API did not return expected choices/message/content:', data);
      return res.status(500).json({ error: 'AI API did not return a valid response', raw: data });
    }

    let text = data.choices[0].message.content;
    console.log('RAW AI RESPONSE:', text);

    // Extract JSON from code block if present
    const codeBlockMatch = text && text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      text = codeBlockMatch[1];
    }

    let roadmap;
    try {
      roadmap = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse roadmap:', e, '\nRaw text:', text);
      return res.status(500).json({ error: 'Failed to parse roadmap', raw: text });
    }
    res.json({ roadmap });
  } catch (err) {
    console.error('Failed to fetch roadmap:', err);
    res.status(500).json({ error: 'Failed to fetch roadmap', details: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
