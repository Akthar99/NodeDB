// tests/performance-final.test.js
const DatabaseServer = require('../server/Server');

async function performanceTest() {
    const server = new DatabaseServer({ 
        port: 9090, 
        cluster: false,
        storagePath: './test-performance-data',
        cache: true,
        cacheSize: 1000
    });
    
    console.log('🚀 Starting Database Performance Test\n');
    await server.start();

    const testFetch = async (url, options = {}) => {
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        let requestUrl = `http://localhost:9090${url}`;
        
        if (options.body && config.method === 'GET') {
            const params = new URLSearchParams();
            if (options.body.query) {
                params.append('query', JSON.stringify(options.body.query));
            }
            if (options.body.options) {
                params.append('options', JSON.stringify(options.body.options));
            }
            requestUrl += `?${params.toString()}`;
        } else if (options.body && (config.method === 'POST' || config.method === 'PUT' || config.method === 'DELETE')) {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(requestUrl, config);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        return response.json();
    };

    try {
        console.log('📊 Testing server connectivity...');
        const serverInfo = await testFetch('/');
        console.log('✅ Server is running:', serverInfo.server);

        // Clean up any existing test data
        try {
            await testFetch('/collections/perftest', { method: 'DELETE' });
        } catch (e) {} // Ignore if collection doesn't exist

        console.log('🗂️ Creating test collection...');
        await testFetch('/collections', {
            method: 'POST',
            body: { name: 'perftest' }
        });

        console.log('\n🎯 PERFORMANCE BENCHMARKS');
        console.log('='.repeat(50));

        // Test 1: Insert Performance
        console.log('\n1. INSERT PERFORMANCE');
        console.log('-'.repeat(30));
        
        const insertStart = Date.now();
        const insertCount = 100;
        
        for (let i = 0; i < insertCount; i++) {
            await testFetch('/perftest', {
                method: 'POST',
                body: {
                    id: i,
                    name: `User ${i}`,
                    email: `user${i}@example.com`,
                    age: Math.floor(Math.random() * 50) + 18,
                    category: `category-${i % 5}`,
                    score: Math.random() * 100,
                    active: i % 2 === 0,
                    tags: [`tag${i % 3}`, `tag${(i + 1) % 3}`],
                    createdAt: new Date().toISOString(),
                    metadata: {
                        visits: Math.floor(Math.random() * 100),
                        lastLogin: new Date(Date.now() - Math.random() * 10000000000).toISOString()
                    }
                }
            });
        }
        const insertTime = Date.now() - insertStart;
        console.log(`   Documents: ${insertCount}`);
        console.log(`   Time: ${insertTime}ms`);
        console.log(`   Throughput: ${(insertCount/insertTime*1000).toFixed(2)} ops/sec`);

        // Test 2: Query Performance
        console.log('\n2. QUERY PERFORMANCE');
        console.log('-'.repeat(30));
        
        const queryStart = Date.now();
        const queryCount = 100;
        const queryPromises = [];
        
        for (let i = 0; i < queryCount; i++) {
            queryPromises.push(testFetch('/perftest', {
                method: 'GET',
                body: { 
                    query: { 
                        category: `category-${i % 5}`,
                        age: { $gte: 25 },
                        active: true
                    },
                    options: { limit: 10, sort: { age: -1 } }
                }
            }));
        }
        
        await Promise.all(queryPromises);
        const queryTime = Date.now() - queryStart;
        console.log(`   Queries: ${queryCount} (parallel)`);
        console.log(`   Time: ${queryTime}ms`);
        console.log(`   Throughput: ${(queryCount/queryTime*1000).toFixed(2)} queries/sec`);

        // Test 3: Complex Query Performance
        console.log('\n3. COMPLEX QUERY PERFORMANCE');
        console.log('-'.repeat(30));
        
        const complexStart = Date.now();
        const complexCount = 50;
        
        for (let i = 0; i < complexCount; i++) {
            await testFetch('/perftest', {
                method: 'GET',
                body: {
                    query: {
                        $or: [
                            { age: { $gte: 30, $lte: 40 } },
                            { score: { $gte: 80 } }
                        ],
                        $and: [
                            { active: true },
                            { 'metadata.visits': { $gt: 10 } }
                        ]
                    },
                    options: {
                        sort: { score: -1, age: 1 },
                        limit: 5
                    }
                }
            });
        }
        const complexTime = Date.now() - complexStart;
        console.log(`   Queries: ${complexCount} (complex)`);
        console.log(`   Time: ${complexTime}ms`);
        console.log(`   Throughput: ${(complexCount/complexTime*1000).toFixed(2)} queries/sec`);

        // Test 4: Update Performance
        console.log('\n4. UPDATE PERFORMANCE');
        console.log('-'.repeat(30));
        
        const updateStart = Date.now();
        const updateCount = 50;
        
        for (let i = 0; i < updateCount; i++) {
            await testFetch('/perftest', {
                method: 'PUT',
                body: {
                    query: { category: `category-${i % 5}` },
                    update: { 
                        $set: { 
                            updated: true, 
                            lastModified: new Date().toISOString(),
                            score: Math.random() * 100
                        } 
                    }
                }
            });
        }
        const updateTime = Date.now() - updateStart;
        console.log(`   Updates: ${updateCount}`);
        console.log(`   Time: ${updateTime}ms`);
        console.log(`   Throughput: ${(updateCount/updateTime*1000).toFixed(2)} updates/sec`);

        // Test 5: Count Performance
        console.log('\n5. COUNT PERFORMANCE');
        console.log('-'.repeat(30));
        
        const countStart = Date.now();
        const countResult = await testFetch('/perftest/count', {
            method: 'GET',
            body: { query: { active: true } }
        });
        const countTime = Date.now() - countStart;
        
        console.log(`   Active users: ${countResult.count}`);
        console.log(`   Time: ${countTime}ms`);

        // Test 6: Bulk Operations
        console.log('\n6. BULK OPERATIONS');
        console.log('-'.repeat(30));
        
        const bulkStart = Date.now();
        const bulkCount = 100;
        const bulkPromises = [];
        
        for (let i = 0; i < bulkCount; i++) {
            bulkPromises.push(
                testFetch('/perftest', {
                    method: 'GET',
                    body: {
                        query: { score: { $gte: 50 } },
                        options: { limit: 5 }
                    }
                })
            );
        }
        
        await Promise.all(bulkPromises);
        const bulkTime = Date.now() - bulkStart;
        console.log(`   Operations: ${bulkCount} (parallel)`);
        console.log(`   Time: ${bulkTime}ms`);
        console.log(`   Throughput: ${(bulkCount/bulkTime*1000).toFixed(2)} ops/sec`);

        // Final Results
        const totalTime = Date.now() - insertStart;
        const totalOperations = insertCount + queryCount + complexCount + updateCount + 1 + bulkCount;
        
        console.log('\n📈 PERFORMANCE SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total operations: ${totalOperations}`);
        console.log(`Total test time: ${totalTime}ms`);
        console.log(`Overall throughput: ${(totalOperations/totalTime*1000).toFixed(2)} ops/sec`);
        console.log(`Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

        // Server Statistics
        const stats = await testFetch('/stats');
        console.log('\n📊 SERVER STATISTICS');
        console.log('='.repeat(50));
        console.log(`Total requests: ${stats.requests}`);
        console.log(`Inserts: ${stats.inserts}`);
        console.log(`Queries: ${stats.queries}`);
        console.log(`Updates: ${stats.updates}`);
        console.log(`Cache hits: ${stats.cacheHits}`);
        console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
        console.log(`Uptime: ${(stats.uptime / 1000).toFixed(1)}s`);

        console.log('\n✅ PERFORMANCE TEST COMPLETED SUCCESSFULLY! 🎉');

    } catch (error) {
        console.error('❌ Performance test failed:', error);
    } finally {
        console.log('\n🧹 Cleaning up...');
        await server.stop();
        console.log('Server stopped');
    }
}

performanceTest().catch(console.error);