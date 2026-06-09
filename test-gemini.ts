import { classifyTasksExecution } from './services/geminiService.ts';

const tasks = [
  { id: 'T-OTH.1', title: 'Daily removal of chip build-up on carriage roadways.', type: 'Servicing' },
  { id: 'T-STP.2', title: 'Update operator daily checklist to include roadway clearing.', type: 'Procedural Change' }
];

classifyTasksExecution(tasks).then(console.log).catch(console.error);
