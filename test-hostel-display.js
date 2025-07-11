// Quick Test Script for Hostel Display
// Run this in browser console to test if hostels are loading and displaying

console.log('🧪 Testing Hostel Display System...');

// Test 1: Check if Supabase client exists
console.log('\n1️⃣ Testing Supabase Connection...');
if (typeof supabase !== 'undefined') {
  console.log('✅ Supabase client found');
} else {
  console.log('❌ Supabase client not found');
}

// Test 2: Check if direct sync is loaded
console.log('\n2️⃣ Testing Direct Sync...');
if (typeof directSync !== 'undefined') {
  console.log('✅ Direct sync system loaded');
} else {
  console.log('❌ Direct sync system not found');
}

// Test 3: Check for hostel containers
console.log('\n3️⃣ Testing Hostel Containers...');
const publicList = document.getElementById('public-list');
const hostelGrid = document.querySelector('.hostel-grid');

if (publicList) {
  console.log('✅ Public list container found:', publicList);
} else {
  console.log('❌ Public list container not found');
}

if (hostelGrid) {
  console.log('✅ Hostel grid container found:', hostelGrid);
} else {
  console.log('❌ Hostel grid container not found');
}

// Test 4: Check localStorage cache
console.log('\n4️⃣ Testing Data Cache...');
const cachedData = localStorage.getItem('hostels_data');
if (cachedData) {
  const hostels = JSON.parse(cachedData);
  console.log(`✅ Found ${hostels.length} hostels in cache`);
  console.log('First hostel:', hostels[0]?.name || 'No hostels');
} else {
  console.log('❌ No cached hostel data found');
}

// Test 5: Try direct data load
console.log('\n5️⃣ Testing Direct Data Load...');
async function testDirectLoad() {
  try {
    if (typeof manualDirectSync === 'function') {
      console.log('🔄 Attempting direct sync...');
      const result = await manualDirectSync();
      console.log('✅ Direct sync completed, loaded hostels:', result?.length || 0);
    } else {
      console.log('❌ Manual direct sync function not available');
    }
  } catch (error) {
    console.log('❌ Direct sync failed:', error);
  }
}

testDirectLoad();

// Test 6: Force manual display
console.log('\n6️⃣ Testing Manual Display...');
if (typeof directSync !== 'undefined' && directSync.displayManually) {
  const testHostels = [
    {
      id: 7,
      name: 'Al-Noor Boys Hostel',
      gender: 'Male',
      location: '150, Ali town, lahore',
      phone: '+92-300-4909528'
    },
    {
      id: 8,
      name: 'Al-Noor Girls Hostel',
      gender: 'Female',
      location: 'Ali Town & Sultan Town, Lahore',
      phone: '+92-300-4909528'
    }
  ];
  
  console.log('🔄 Testing manual display with sample data...');
  directSync.displayManually(testHostels);
  console.log('✅ Manual display test completed');
} else {
  console.log('❌ Manual display function not available');
}

console.log('\n🏁 Test Complete! Check the page to see if hostels are displayed.');
console.log('If not, try clicking the green "🔄 Direct Sync" button on the page.');