// Khởi tạo Particles.js với cấu hình cơ bản
    particlesJS('particles-js', {
      "particles": {
        "number": { "value": 60, "density": { "enable": true, "value_area": 800 } },
        "color": { "value": "#1abc9c" },
        "shape": {
          "type": "circle",
          "stroke": { "width": 0, "color": "#000000" },
          "polygon": { "nb_sides": 5 }
        },
        "opacity": {
          "value": 0.4,
          "random": false,
          "anim": { "enable": false }
        },
        "size": {
          "value": 3,
          "random": true,
          "anim": { "enable": false }
        },
        "line_linked": {
          "enable": true,
          "distance": 140,
          "color": "#1abc9c",
          "opacity": 0.2,
          "width": 1
        },
        "move": {
          "enable": true,
          "speed": 2,
          "direction": "none",
          "random": false,
          "straight": false,
          "out_mode": "out",
          "bounce": false
        }
      },
      "interactivity": {
        "detect_on": "canvas",
        "events": {
          "onhover": { "enable": true, "mode": "grab" },
          "onclick": { "enable": true, "mode": "push" },
          "resize": true
        },
        "modes": {
          "grab": { "distance": 120, "line_linked": { "opacity": 1 } },
          "push": { "particles_nb": 4 }
        }
      },
      "retina_detect": true
    });

    // Thêm class scroll cho header khi cuộn trang
    const header = document.getElementById('mainHeader');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });

    // Toggle menu trên màn hình nhỏ & đổi icon hamburger
    const menuBtn = document.getElementById('menuBtn');
    const mainNav = document.getElementById('mainNav');
    menuBtn.addEventListener('click', () => {
      mainNav.classList.toggle('active');
      if (menuBtn.classList.contains('fa-bars')) {
        menuBtn.classList.remove('fa-bars');
        menuBtn.classList.add('fa-times');
      } else {
        menuBtn.classList.remove('fa-times');
        menuBtn.classList.add('fa-bars');
      }
    });

    // Entry animations cho card khi DOM load
    document.addEventListener('DOMContentLoaded', () => {
      const cards = document.querySelectorAll('.card');
      cards.forEach(card => {
        card.classList.add('animate__animated', 'animate__fadeInUp');
      });
    });