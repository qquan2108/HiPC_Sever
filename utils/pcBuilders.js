function calculateTotalPrice(items) {
  return items.reduce((sum, p) => sum + (p.price || 0) * (p.quantity || 1), 0);
}

function estimatePerformance(items) {
  // Simple heuristic: average cpu + gpu price used as score
  let cpu = items.find(i => i.category === 'CPU');
  let gpu = items.find(i => i.category === 'GPU');
  let score = 0;
  if (cpu) score += cpu.price || 0;
  if (gpu) score += gpu.price || 0;
  return { gaming: score, render: score, overall: score };
}

function checkCompatibility(items) {
  const issues = [];
  const cpu = items.find(i => i.category === 'CPU');
  const main = items.find(i => i.category === 'Mainboard');
  if (cpu && main) {
    const cpuSocket = (cpu.specifications || []).find(s => s.key.toLowerCase().includes('socket'));
    const mainSocket = (main.specifications || []).find(s => s.key.toLowerCase().includes('socket'));
    if (cpuSocket && mainSocket && cpuSocket.value !== mainSocket.value) {
      issues.push('CPU socket không khớp Mainboard');
    }
  }
  const ram = items.find(i => i.category === 'RAM');
  if (ram && main) {
    const ramType = (ram.specifications || []).find(s => s.key.toLowerCase().includes('ddr'));
    const mainRam = (main.specifications || []).find(s => s.key.toLowerCase().includes('ddr'));
    if (ramType && mainRam && ramType.value !== mainRam.value) {
      issues.push('Loại RAM không tương thích Mainboard');
    }
  }
  return { compatible: issues.length === 0, issues };
}

module.exports = { calculateTotalPrice, estimatePerformance, checkCompatibility };