// 测试删除供应商分配功能
const axios = require('axios');

async function testRemoveSupplierAssignment() {
    const baseURL = 'http://localhost:3000/api';
    
    // 模拟登录获取token（需要根据实际认证方式调整）
    try {
        console.log('测试删除供应商分配API...');
        
        // 首先获取一个询价单列表
        const quotesResponse = await axios.get(`${baseURL}/quotes`, {
            headers: {
                'Authorization': 'Bearer your-token-here' // 需要替换为实际token
            }
        });
        
        console.log('获取到的询价单数量:', quotesResponse.data.length);
        
        // 找到一个有供应商分配的询价单
        const quoteWithSupplier = quotesResponse.data.find(q => q.supplier);
        
        if (quoteWithSupplier) {
            console.log('找到有供应商的询价单:', quoteWithSupplier.quoteNumber);
            console.log('当前供应商:', quoteWithSupplier.supplier.name);
            
            // 测试删除供应商分配
            const removeResponse = await axios.patch(
                `${baseURL}/quotes/${quoteWithSupplier._id}/remove-supplier`,
                {},
                {
                    headers: {
                        'Authorization': 'Bearer your-token-here' // 需要替换为实际token
                    }
                }
            );
            
            console.log('删除供应商分配成功:');
            console.log('- 询价单状态:', removeResponse.data.status);
            console.log('- 供应商字段:', removeResponse.data.supplier);
            
        } else {
            console.log('没有找到有供应商分配的询价单');
        }
        
    } catch (error) {
        console.error('测试失败:', error.response?.data || error.message);
    }
}

// 运行测试
testRemoveSupplierAssignment();