export function parseShowNotes(notesJson) {
  if (!notesJson) return '';

  let nodes;
  try {
    nodes = JSON.parse(notesJson);
  } catch {
    return '';
  }

  if (!Array.isArray(nodes) || nodes.length === 0) return '';

  return nodes
    .map(node => {
      if (!node.children) return '';
      return node.children.map(child => child.text || '').join('');
    })
    .map(text => text.trim())
    .filter(text => text.length > 0)
    .join('\n\n');
}
