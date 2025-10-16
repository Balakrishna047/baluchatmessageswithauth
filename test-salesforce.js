
// Test script to simulate Salesforce user authentication

const SERVER_URL = 'http://localhost:10000'; // Change to production URL when deployed

async function testSalesforceAuth() {
    console.log('🧪 Testing Salesforce Authentication...\n');

    // Step 1: Authenticate Salesforce user
    const salesforceUser = {
        userId: '005xx000001X8Uz',
        username: 'john.salesforce',
        email: 'john@salesforce.com',
        name: 'John Salesforce',
        photoUrl: 'https://example.com/photo.jpg'
    };

    try {
        const response = await fetch(`${SERVER_URL}/api/salesforce/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(salesforceUser)
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Salesforce Authentication Successful!');
            console.log('Token:', data.data.token);
            console.log('User:', data.data.user);
            console.log('\n📋 Use this URL to login as Salesforce user:');
            console.log(`http://localhost:3000?sfToken=${data.data.token}`);
            console.log('\n🔗 Or use this token in WebSocket connection');
        } else {
            console.error('❌ Authentication failed:', data.error);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Run the test
testSalesforceAuth();
