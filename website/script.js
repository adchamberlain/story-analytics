// Story Analytics Landing Page - Terminal Effects

document.addEventListener('DOMContentLoaded', function() {
    // Add blinking cursor to logo
    const logo = document.querySelector('.logo');
    if (logo) {
        const cursor = document.createElement('span');
        cursor.className = 'cursor';
        logo.appendChild(cursor);
    }
});
