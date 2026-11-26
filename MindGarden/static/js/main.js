// 密码可见性切换
document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', function() {
        const passwordInput = this.previousElementSibling;
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            this.textContent = '隐藏';
        } else {
            passwordInput.type = 'password';
            this.textContent = '显示';
        }
    });
});

// 密码强度检查
document.querySelectorAll('input[type="password"]').forEach(input => {
    input.addEventListener('input', function() {
        const password = this.value;
        let strength = 0;
        
        if (password.length >= 8) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/[0-9]/.test(password)) strength += 1;
        if (/[^A-Za-z0-9]/.test(password)) strength += 1;
        
        const strengthBar = document.getElementById('password-strength');
        if (strengthBar) {
            strengthBar.style.width = `${strength * 25}%`;
            strengthBar.className = `strength-${strength}`;
        }
    });
});

// 表单验证
document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function(e) {
        let valid = true;
        
        // 检查必填字段
        this.querySelectorAll('[required]').forEach(field => {
            if (!field.value.trim()) {
                field.classList.add('error');
                valid = false;
            } else {
                field.classList.remove('error');
            }
        });
        
        // 检查密码匹配
        const password = this.querySelector('#password');
        const confirmPassword = this.querySelector('#password2');
        if (password && confirmPassword && password.value !== confirmPassword.value) {
            confirmPassword.classList.add('error');
            valid = false;
            alert('两次输入的密码不一致');
        }
        
        if (!valid) {
            e.preventDefault();
        }
    });
});