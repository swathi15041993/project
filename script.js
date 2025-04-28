// Initialize Mermaid
mermaid.initialize({
  startOnLoad: true,
  theme: 'default',
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: 'basis',
    rankSpacing: 100,
    nodeSpacing: 50
  }
});

// Populate dropdown with job information
fetch('/api/jobs')
  .then(r => r.json())
  .then(jobs => {
    const datalist = document.getElementById('job-titles');
    datalist.innerHTML = '';
    jobs.forEach(job => {
      const opt = document.createElement('option');
      opt.value = job.title;
      datalist.appendChild(opt);
    });
  })
  .catch(error => {
    console.error('Error loading jobs:', error);
    const sel = document.getElementById('job-select');
    sel.innerHTML = '<option value="">Error loading jobs</option>';
  });

// On selection, fetch and render timeline
const container = document.getElementById('roadmap');
const flowchartContainer = document.getElementById('flowchart');
let timeline;

function generateFlowchart(roadmap) {
  if (!roadmap || roadmap.length === 0) return '';

  // Detect branching format (has 'id' and 'label' fields)
  if (roadmap[0].id && roadmap[0].label) {
    let flowchart = 'graph TD\n';
    const nodeMap = {};
    roadmap.forEach(step => nodeMap[step.id] = step);
    roadmap.forEach(step => {
      flowchart += `${step.id}[${step.label}]\n`;
      if (step.next) {
        step.next.forEach(n => {
          if (n.label) {
            flowchart += `${step.id} -- ${n.label} --> ${n.id}\n`;
          } else {
            flowchart += `${step.id} --> ${n.id}\n`;
          }
        });
      }
    });
    return flowchart;
  }

  // Fallback: sequential flowchart for classic format
  let flowchart = 'graph TD\n';
  let prevNode = null;
  roadmap.forEach((step, index) => {
    const nodeId = `step${step.stepId}`;
    const nodeLabel = `${step.title}`;
    flowchart += `${nodeId}[${nodeLabel}]\n`;
    if (prevNode) {
      flowchart += `${prevNode} --> ${nodeId}\n`;
    }
    prevNode = nodeId;
  });
  return flowchart;
}

async function fetchAIRoadmap(title) {
  const res = await fetch(`/api/roadmap/ai?title=${encodeURIComponent(title)}`);
  const data = await res.json();
  if (!data.roadmap) {
    alert('Could not generate a roadmap for this job title. Try another or check your connection.');
    flowchartContainer.innerHTML = '<div class="alert alert-danger">Could not generate a roadmap for this job title.</div>';
    return [];
  }
  console.log('AI Roadmap:', data.roadmap);
  return data.roadmap;
}

function handleJobSelect() {
  const input = document.getElementById('job-select');
  const title = input.value.trim();
  if (!title) return;
  // Trigger the roadmap/flowchart logic (reuse the event handler logic)
  const event = new Event('change');
  input.dispatchEvent(event);
}

document.getElementById('job-select').addEventListener('blur', handleJobSelect);
document.getElementById('job-select').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') handleJobSelect();
});

document.getElementById('job-select').addEventListener('change', async e => {
  const title = e.target.value.trim();
  if (!title) {
    document.getElementById('job-details').classList.add('d-none');
    if (timeline) timeline.destroy();
    flowchartContainer.innerHTML = '';
    return;
  }

  // Fetch roadmap and job info
  try {
    const res = await fetch(`/api/roadmap?title=${encodeURIComponent(title)}`);
    if (!res.ok) {
      throw new Error('Failed to fetch roadmap');
    }
    const data = await res.json();
    const roadmapData = data.roadmap;
    const jobInfo = data.jobInfo;

    // Update job details
    const jobDetails = document.getElementById('job-details');
    jobDetails.classList.remove('d-none');
    document.getElementById('job-description').textContent = jobInfo.description;
    document.getElementById('average-salary').textContent = `Avg. Salary: ${jobInfo.averageSalary}`;
    const skillsList = document.getElementById('skills-list');
    skillsList.innerHTML = '';
    (jobInfo.skills || []).forEach(skill => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = skill;
      skillsList.appendChild(badge);
    });

    // Timeline: only for classic format
    if (roadmapData[0] && roadmapData[0].stepId) {
      const items = new vis.DataSet(
        roadmapData.map(item => ({
          id: item.stepId,
          content: `
            <div class="timeline-item">
              <h6 class="mb-1">${item.title}</h6>
              <p class="mb-0 small">${item.description}</p>
              <div class="timeline-dates small text-muted">
                ${new Date(item.startDate).toLocaleDateString()} - 
                ${new Date(item.endDate).toLocaleDateString()}
              </div>
            </div>
          `,
          start: item.startDate,
          end: item.endDate,
          className: 'timeline-step'
        }))
      );
      const options = {
        stack: false,
        showCurrentTime: true,
        zoomable: true,
        moveable: true,
        orientation: 'top',
        margin: { item: 20, axis: 50 },
        format: {
          minorLabels: { month: 'MMM YYYY' },
          majorLabels: { year: 'YYYY' }
        }
      };
      if (timeline) timeline.destroy();
      timeline = new vis.Timeline(container, items, options);
      timeline.on('click', (properties) => {
        if (properties.item) {
          const item = items.get(properties.item);
          console.log('Clicked item:', item);
        }
      });
    } else {
      if (timeline) timeline.destroy();
      container.innerHTML = `<div class="alert alert-info">This roadmap is best viewed as a flowchart.</div>`;
    }

    // Generate and render flowchart
    const flowchart = generateFlowchart(roadmapData);
    flowchartContainer.innerHTML = flowchart;
    mermaid.init(undefined, flowchartContainer);
  } catch (error) {
    console.error('Error:', error);
    flowchartContainer.innerHTML = '<div class="alert alert-danger">Failed to load roadmap. Please try again.</div>';
  }
});
