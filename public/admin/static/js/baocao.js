        // Initialize AOS
        AOS.init({
            duration: 800,
            easing: 'ease-out-cubic',
            once: true
        });

        // Sample data for demonstration
        const sampleData = {
            revenue: 15750000,
            orders: 234,
            avgRevenue: 67307,
            monthlyData: [
                { month: '2024-01', revenue: 12000000 },
                { month: '2024-02', revenue: 15000000 },
                { month: '2024-03', revenue: 18000000 },
                { month: '2024-04', revenue: 16000000 },
                { month: '2024-05', revenue: 20000000 },
                { month: '2024-06', revenue: 22000000 }
            ]
        };

        // Format currency
        function formatCurrency(amount) {
            return new Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND'
            }).format(amount);
        }

        // Animate counters
        function animateCounters() {
            const revenueCounter = new CountUp('revenue', 0, sampleData.revenue, 0, 2, {
                suffix: '₫',
                separator: '.'
            });
            const ordersCounter = new CountUp('orders', 0, sampleData.orders, 0, 2);
            const avgCounter = new CountUp('avgRevenue', 0, sampleData.avgRevenue, 0, 2, {
                suffix: '₫',
                separator: '.'
            });

            revenueCounter.start();
            ordersCounter.start();
            avgCounter.start();
        }

        // Initialize charts
        let revenueChart, compareChart;

        function initRevenueChart() {
            const ctx = document.getElementById('revenueChart').getContext('2d');
            
            revenueChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: sampleData.monthlyData.map(item => {
                        const date = new Date(item.month);
                        return date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
                    }),
                    datasets: [{
                        label: 'Doanh thu',
                        data: sampleData.monthlyData.map(item => item.revenue),
                        borderColor: '#667eea',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#667eea',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                font: {
                                    weight: 500
                                }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0,0,0,0.05)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('vi-VN').format(value) + '₫';
                                },
                                font: {
                                    weight: 500
                                }
                            }
                        }
                    }
                }
            });
        }

        function initCompareChart() {
            const ctx = document.getElementById('compareChart').getContext('2d');
            
            compareChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Tháng 1', 'Tháng 2'],
                    datasets: [{
                        label: 'Doanh thu',
                        data: [12000000, 15000000],
                        backgroundColor: [
                            'rgba(102, 126, 234, 0.8)',
                            'rgba(240, 147, 251, 0.8)'
                        ],
                        borderColor: [
                            '#667eea',
                            '#f093fb'
                        ],
                        borderWidth: 2,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0,0,0,0.05)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return new Intl.NumberFormat('vi-VN').format(value) + '₫';
                                }
                            }
                        }
                    }
                }
            });
        }

        // Populate month selectors
        function populateMonthSelectors() {
            const months = [
                { value: '2024-01', text: 'Tháng 1/2024' },
                { value: '2024-02', text: 'Tháng 2/2024' },
                { value: '2024-03', text: 'Tháng 3/2024' },
                { value: '2024-04', text: 'Tháng 4/2024' },
                { value: '2024-05', text: 'Tháng 5/2024' },
                { value: '2024-06', text: 'Tháng 6/2024' }
            ];

            const month1Select = document.getElementById('month1');
            const month2Select = document.getElementById('month2');

            months.forEach(month => {
                const option1 = new Option(month.text, month.value);
                const option2 = new Option(month.text, month.value);
                month1Select.add(option1);
                month2Select.add(option2);
            });
        }

        // Update table
        function updateTable() {
            const tableBody = document.getElementById('revenueTable');
            tableBody.innerHTML = '';

            sampleData.monthlyData.forEach(item => {
                const row = document.createElement('tr');
                const date = new Date(item.month);
                const monthText = date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
                
                row.innerHTML = `
                    <td><strong>${monthText}</strong></td>
                    <td class="text-end"><strong>${formatCurrency(item.revenue)}</strong></td>
                `;
                tableBody.appendChild(row);
            });
        }

        // Event handlers
        document.getElementById('periodSelect').addEventListener('change', function() {
            const monthInput = document.getElementById('monthInput');
            const weekInput = document.getElementById('weekInput');
            const yearInput = document.getElementById('yearInput');

            monthInput.classList.add('d-none');
            weekInput.classList.add('d-none');
            yearInput.classList.add('d-none');

            switch(this.value) {
                case 'month':
                    monthInput.classList.remove('d-none');
                    break;
                case 'week':
                    weekInput.classList.remove('d-none');
                    break;
                case 'year':
                    yearInput.classList.remove('d-none');
                    break;
            }
        });

        document.getElementById('loadRevenue').addEventListener('click', function() {
            const spinner = document.getElementById('loadingSpinner');
            spinner.style.display = 'flex';
            
            setTimeout(() => {
                spinner.style.display = 'none';
                animateCounters();
                updateTable();
            }, 1000);
        });

        document.getElementById('compareBtn').addEventListener('click', function() {
            const month1 = document.getElementById('month1').value;
            const month2 = document.getElementById('month2').value;

            if (month1 && month2 && month1 !== month2) {
                // Update compare chart with selected months
                const data1 = sampleData.monthlyData.find(item => item.month === month1);
                const data2 = sampleData.monthlyData.find(item => item.month === month2);

                if (data1 && data2) {
                    compareChart.data.data = [data1.revenue, data2.revenue];
                    compareChart.data.labels = [
                        new Date(month1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }),
                        new Date(month2).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
                    ];
                    compareChart.update();
                }
            }
        });

        // Initialize everything when page loads
        document.addEventListener('DOMContentLoaded', function() {
            animateCounters();
            initRevenueChart();
            initCompareChart();
            populateMonthSelectors();
            updateTable();
        });
