document.addEventListener('DOMContentLoaded', checkLogin);

async function checkLogin() {
  try {
    const res = await fetch('/api/user');
    const data = await res.json();
    const userInfo = document.getElementById('user-info');
    const authBtn = document.getElementById('auth-btn');
    const tabs = document.getElementById('tabs-container');
    
    if (data.user) {
      userInfo.textContent = `Halo, ${data.user}`;
      authBtn.style.display = 'none';
      tabs.style.display = 'flex';
    } else {
      userInfo.textContent = 'Tamu';
      authBtn.style.display = 'inline-block';
      tabs.style.display = 'none';
    }
  } catch (e) {
    console.error('Gagal cek login:', e);
  }
}

function toggleAuth() {
  window.location.href = '/auth';
}

document.getElementById('fetchBtn').addEventListener('click', async () => {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return alert('Masukkan URL terlebih dahulu.');

  document.querySelector('.loading').style.display = 'block';
  document.querySelector('.result').style.display = 'none';

  try {
    const res = await fetch('/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.success) {
      const resultDiv = document.querySelector('.result');
      resultDiv.innerHTML = `
        ${data.thumbnailUrl ? `<img src="${data.thumbnailUrl}" alt="Thumbnail" style="max-height:500px; width:100%; border-radius:12px; margin-bottom:15px;">` : ''}
        <div class="meta">
          <p><strong>Judul:</strong> ${data.title}</p>
          <p><strong>Channel/Username:</strong> ${data.channel}</p>
          <p><strong>Likes:</strong> ${data.like_count}</p>
          <p><strong>Views:</strong> ${data.view_count}</p>
          <p><strong>Platform:</strong> ${data.platform}</p>
        </div>
        <div class="download-btns">
          <button class="dl-video" data-url="${url}">📥 Video</button>
          <button class="dl-audio" data-url="${url}">🎵 Audio (MP3)</button>
          <button class="dl-thumb" data-url="${url}">🖼️ Thumbnail</button>
        </div>
      `;
      resultDiv.style.display = 'block';

      document.querySelectorAll('.dl-video, .dl-audio, .dl-thumb').forEach(btn => {
        btn.onclick = (e) => {
          const format = e.target.classList.contains('dl-video') ? 'video' : 
                         e.target.classList.contains('dl-audio') ? 'audio' : 'thumb';
          download(e.target.dataset.url, format);
        };
      });
    } else {
      throw new Error(data.error || 'Gagal mengambil metadata');
    }
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    document.querySelector('.loading').style.display = 'none';
  }
});

async function download(url, format) {
  const popup = document.getElementById('popup');
  
  try {
    const res = await fetch('/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format })
    });
    
    const data = await res.json();
    
    if (data.success) {
      const link = document.createElement('a');
      link.href = data.filePath;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      popup.textContent = '✅ Download berhasil!';
      popup.className = 'popup show';
      setTimeout(() => popup.classList.remove('show'), 3000);
    } else {
      throw new Error(data.error || 'Gagal download');
    }
  } catch (e) {
    popup.textContent = '❌ Gagal: ' + e.message;
    popup.className = 'popup show';
    setTimeout(() => popup.classList.remove('show'), 3000);
  }
}

function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (tab === 'downloader') {
    document.querySelector('.result').style.display = 'block';
    document.getElementById('history').style.display = 'none';
    event.target.classList.add('active');
  } else if (tab === 'history') {
    document.querySelector('.result').style.display = 'none';
    document.getElementById('history').style.display = 'block';
    loadHistory();
    event.target.classList.add('active');
  }
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const data = await res.json();
  const list = document.getElementById('history-list');
  list.innerHTML = data.length === 0 
    ? '<p>Belum ada riwayat.</p>' 
    : data.map(item => {
      // ✅ Cek tipe file
      const isAudio = item.filename.toLowerCase().endsWith('.mp3');
      const isThumbnail = item.filename.toLowerCase().endsWith('.jpg') || 
                           item.filename.toLowerCase().endsWith('.png') ||
                           item.filename.toLowerCase().endsWith('.webp');
      
      // ✅ Pilih ikon/placeholder sesuai tipe file
      let thumbnailSrc, thumbnailStyle;
      
      if (isAudio) {
        // 🎵 Untuk audio: ikon musik
        thumbnailSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmVyc2lvbj0iMS4xIiB2aWV3Qm94PSIwIDAgNTAgNTAiPjxwYXRoIGQ9Ik0xMS41LDI2LjI2N0wxMy4yNjcsMjZsLTIuNzY3LTcuMjY3TDI1LjUsMzRMMTIuNSw3TDE1LjI2Nyw3bC0yLjc2Ny03TDYsMTUuNTY3TDAsMTRsMTAsMjBjMS4xNDcsMC4yMjgsMi4zNDMsMC4zNTUsMy41LDQuMDMzTDM0LjUsMzFjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY3Yy0wLjE3LC0wLjA4My0wLjM0MSwtMC4xNjctMC41LC0wLjI1TDM1LjUsMjVjMC4xNzIsMC4wNjcsMC4zNDMsMC4xMzUsMC41LDAuMjA4bDEuODMzLTAuNDY7';
        thumbnailStyle = 'width:50px; height:50px; background:#e0e0ff; display:flex; align-items:center; justify-content:center; border-radius:6px;';
      } else if (isThumbnail) {
        // 🖼️ Untuk thumbnail: tampilkan gambar
        thumbnailSrc = `/downloads/${item.filename}`;
        thumbnailStyle = 'width:50px; height:50px; object-fit:cover; border-radius:6px; background:#f0f0f0;';
      } else {
        // 📹 Untuk video: gunakan placeholder
        thumbnailSrc = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIGZpbGw9IiNmZmYiIC8+PGxpbmUgeDE9IjEwIiB5MT0iMTAiIHgyPSI0MCIgeTI9IjQwIiBzdHJva2U9IiM3NzciIHN0cm9rZS13aWR0aD0iMiIvPjxsaW5lIHgxPSIxMCIgeTE9IjQwIiB4Mj0iNDAiIHkyPSIxMCIgc3Ryb2tlPSIjNzc3IiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=';
        thumbnailStyle = 'width:50px; height:50px; object-fit:cover; border-radius:6px; background:#f0f0f0;';
      }

      return `
        <div style="border:1px solid #eee; padding:12px; margin:8px 0; border-radius:8px; background:#fafafa; display:flex; gap:12px; align-items:center;">
          <!-- Thumbnail atau Icon -->
          <img src="${thumbnailSrc}" alt="${isAudio ? 'Audio File' : 'Thumbnail'}" style="${thumbnailStyle}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIGZpbGw9IiNmZmYiIC8+PGxpbmUgeDE9IjEwIiB5MT0iMTAiIHgyPSI0MCIgeTI9IjQwIiBzdHJva2U9IiM3NzciIHN0cm9rZS13aWR0aD0iMiIvPjxsaW5lIHgxPSIxMCIgeTE9IjQwIiB4Mj0iNDAiIHkyPSIxMCIgc3Ryb2tlPSIjNzc3IiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=';" />
          
          <!-- Info -->
          <div style="flex:1; min-width:0;">
            <strong>${item.title || '—'}</strong><br>
            <small style="color:#666;">${item.platform} • ${new Date(item.timestamp).toLocaleString()}</small>
          </div>
          
          <!-- Tombol Unduh Ulang -->
          <a href="/downloads/${item.filename}" download style="color:#6a5acd; text-decoration:none; font-weight:600; white-space:nowrap;">
            📥 Unduh Ulang
          </a>
        </div>
      `;
    }).join('');
}