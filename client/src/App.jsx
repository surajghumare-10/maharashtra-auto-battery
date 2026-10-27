import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import Navigation from './components/Navigation';
import Login from './pages/Login';
import NewBill from './pages/NewBill';
import BillsList from './pages/BillsList';
import PriceList from './pages/PriceList';
import CustomerDues from './pages/CustomerDues';
import InventoryReport from './pages/InventoryReport';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';

function MainApp() {
  const { user, canViewDues, canViewInventory, isOwner, isManager } = useAuth();
  const [activeTab, setActiveTab] = useState('new_bill');
  const [selectedBillId, setSelectedBillId] = useState(null);

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans select-none">
      <Header />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1">
        {activeTab === 'new_bill' && (
          <NewBill
            onOpenBillDetail={(id) => {
              setSelectedBillId(id);
              setActiveTab('bills');
            }}
          />
        )}

        {activeTab === 'bills' && (
          <BillsList
            initialSelectedBillId={selectedBillId}
            onClearInitialBillId={() => setSelectedBillId(null)}
          />
        )}

        {activeTab === 'price_list' && <PriceList />}

        {activeTab === 'dues' && canViewDues && <CustomerDues />}

        {activeTab === 'inventory' && canViewInventory && <InventoryReport />}

        {activeTab === 'dashboard' && (isOwner || isManager) && (
          <Dashboard
            onOpenBillDetail={(id) => {
              setSelectedBillId(id);
              setActiveTab('bills');
            }}
          />
        )}

        {activeTab === 'settings' && isOwner && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
