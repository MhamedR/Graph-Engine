/**
 * Paints an export picture onto a canvas and downloads the chosen file.
 */

import {jpegToPdf, toDrawio, type ExportEdge, type ExportPicture} from '../export.js';

const FIELD = '#12110e';
const INK = '#e7e1d4';
const MUTED = '#8d877c';
const COPPER = '#e07a45';
const BUNDLE = '#b08972';
const NODE = '#18160f';
const FOLDER = '#3a3128';
const FOLDER_LINE = '#b08972';
const FILE = '#1c2124';
const FILE_LINE = '#8d877c';
const SCALE = 2;

const CURVE =
  /^M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+C\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?),\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/;

export async function paintJpeg(picture: ExportPicture): Promise<{
  blob: Blob;
  width: number;
  height: number;
}> {
  await document.fonts.ready;
  const width = Math.max(1, Math.ceil(picture.width * SCALE));
  const height = Math.max(1, Math.ceil(picture.height * SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');

  context.scale(SCALE, SCALE);
  context.fillStyle = FIELD;
  context.fillRect(0, 0, picture.width, picture.height);

  for (const rank of picture.ranks) {
    if (rank.lift) {
      context.fillStyle = 'rgba(231, 225, 212, 0.035)';
      context.fillRect(rank.x, 0, rank.width, picture.height);
    }
    context.fillStyle = MUTED;
    context.font = '400 10px Outfit, sans-serif';
    context.letterSpacing = '0.22em';
    context.textBaseline = 'top';
    context.fillText(String(rank.index), rank.x, 10);
  }

  context.letterSpacing = '0px';
  context.lineWidth = 1;
  context.lineCap = 'butt';

  for (const edge of picture.edges) {
    drawEdge(context, edge);
  }

  for (const node of picture.nodes) {
    context.save();
    context.globalAlpha = node.opacity;
    const stroke = node.copper
      ? COPPER
      : node.quietBorder
        ? 'rgba(231, 225, 212, 0.08)'
        : node.shape === 'folder'
          ? FOLDER_LINE
          : node.shape === 'file'
            ? FILE_LINE
            : 'rgba(231, 225, 212, 0.16)';
    context.strokeStyle = stroke;
    context.fillStyle = node.shape === 'folder' ? FOLDER : node.shape === 'file' ? FILE : NODE;
    if (node.shape === 'folder') paintFolder(context, node);
    else context.fillRect(node.x, node.y, node.width, node.height);
    if (node.shape !== 'folder') {
      context.strokeRect(node.x + 0.5, node.y + 0.5, node.width - 1, node.height - 1);
    }
    if (node.shape === 'file') paintFold(context, node);
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillStyle = INK;
    context.font = node.selected
      ? '520 14px Fraunces, Palatino, serif'
      : '400 14px Outfit, sans-serif';
    context.fillText(node.label, node.x + 14, node.y + node.height / 2 - 8);
    context.fillStyle = MUTED;
    context.font = '400 11px Outfit, sans-serif';
    context.letterSpacing = '0.06em';
    context.fillText(node.detail, node.x + 14, node.y + node.height / 2 + 10);
    context.restore();
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
  if (!blob) throw new Error('Could not encode the picture.');
  return {blob, width, height};
}

export async function savePicture(
  kind: 'drawio' | 'pdf' | 'jpeg',
  picture: ExportPicture,
  filename: string,
): Promise<void> {
  if (kind === 'drawio') {
    download(filename, new Blob([toDrawio(picture)], {type: 'application/xml'}));
    return;
  }

  const jpeg = await paintJpeg(picture);
  if (kind === 'jpeg') {
    download(filename, jpeg.blob);
    return;
  }

  const pdf = jpegToPdf(
    new Uint8Array(await jpeg.blob.arrayBuffer()),
    jpeg.width,
    jpeg.height,
    picture.width,
    picture.height,
  );
  const bytes = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(bytes).set(pdf);
  download(filename, new Blob([bytes], {type: 'application/pdf'}));
}

function paintFolder(
  context: CanvasRenderingContext2D,
  node: ExportPicture['nodes'][number],
): void {
  const tabWidth = Math.min(36, node.width * 0.28);
  const tabHeight = 7;
  context.beginPath();
  context.moveTo(node.x, node.y + node.height);
  context.lineTo(node.x, node.y - tabHeight);
  context.lineTo(node.x + tabWidth, node.y - tabHeight);
  context.lineTo(node.x + tabWidth, node.y);
  context.lineTo(node.x + node.width, node.y);
  context.lineTo(node.x + node.width, node.y + node.height);
  context.closePath();
  context.fill();
  context.stroke();
}

function paintFold(context: CanvasRenderingContext2D, node: ExportPicture['nodes'][number]): void {
  const size = 14;
  const right = node.x + node.width;
  context.beginPath();
  context.moveTo(right - size, node.y);
  context.lineTo(right, node.y);
  context.lineTo(right, node.y + size);
  context.closePath();
  context.fillStyle = 'rgba(231, 225, 212, 0.4)';
  context.fill();
  context.beginPath();
  context.moveTo(right - size, node.y);
  context.lineTo(right - size, node.y + size);
  context.lineTo(right, node.y + size);
  context.stroke();
}

function drawEdge(context: CanvasRenderingContext2D, edge: ExportEdge): void {
  const match = CURVE.exec(edge.d);
  if (!match) return;
  const [, x1, y1, c1x, c1y, c2x, c2y, x2, y2] = match;
  if (
    x1 === undefined ||
    y1 === undefined ||
    c1x === undefined ||
    c1y === undefined ||
    c2x === undefined ||
    c2y === undefined ||
    x2 === undefined ||
    y2 === undefined
  ) {
    return;
  }

  const startX = Number(x1);
  const startY = Number(y1);
  const control1X = Number(c1x);
  const control1Y = Number(c1y);
  const control2X = Number(c2x);
  const control2Y = Number(c2y);
  const endX = Number(x2);
  const endY = Number(y2);

  context.save();
  context.globalAlpha = edge.active ? 1 : 0.15;
  context.strokeStyle = edge.bundle ? BUNDLE : 'rgba(231, 225, 212, 0.72)';
  context.fillStyle = edge.bundle ? BUNDLE : INK;
  context.setLineDash(edge.bundle ? [4, 5] : []);
  context.beginPath();
  context.moveTo(startX, startY);
  context.bezierCurveTo(control1X, control1Y, control2X, control2Y, endX, endY);
  context.stroke();

  const angle = Math.atan2(endY - control2Y, endX - control2X);
  context.translate(endX, endY);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-7, -3.2);
  context.lineTo(-7, 3.2);
  context.closePath();
  context.fill();
  context.restore();
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
