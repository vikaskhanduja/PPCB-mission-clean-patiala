import { API_BASE } from './config.js';

let role = 'institution';

document.querySelectorAll('[data-role]').forEach((b) => {
  b.onclick = () => {
    role = b.dataset.role;
    document.querySelectorAll('[data-role]').forEach((x) => x.classList.toggle('active', x === b));
    if (role === 'institution') {
      email.placeholder = 'e.g. tiet@mcpatiala.in';
      if (!email.value || email.value === 'officer@ppcb.gov.in') {
        email.value = '';
        password.value = '';
      }
    } else {
      email.placeholder = 'e.g. officer@ppcb.gov.in';
      if (!email.value || email.value.endsWith('@mcpatiala.in')) {
        email.value = 'officer@ppcb.gov.in';
        password.value = '';
      }
    }
  };
});

document.querySelector('[data-role="institution"]').click();

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  error.textContent = '';
  const submitBtn = loginForm.querySelector('button');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    const r = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    });
    const d = await r.json();
    if (!r.ok) {
      error.textContent = d.message || 'Login failed';
      return;
    }
    localStorage.setItem('mcp', JSON.stringify(d));
    location = 'dashboard.html';
  } catch (err) {
    error.textContent = 'Network or server error. Please try again.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Secure Login';
  }
};