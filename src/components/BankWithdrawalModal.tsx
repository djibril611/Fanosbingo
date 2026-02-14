import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Building2, AlertCircle, CheckCircle } from 'lucide-react';

interface WithdrawalBank {
  id: string;
  bank_name: string;
  is_active: boolean;
  display_order: number;
}

interface BankWithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
  wonBalance: number;
  onSuccess: () => void;
}

export function BankWithdrawalModal({
  isOpen,
  onClose,
  telegramUserId,
  wonBalance,
  onSuccess
}: BankWithdrawalModalProps) {
  const [step, setStep] = useState<'amount' | 'bank' | 'account' | 'name' | 'confirm'>('amount');
  const [amount, setAmount] = useState('');
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [banks, setBanks] = useState<WithdrawalBank[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableBalance = wonBalance - pendingWithdrawals;

  useEffect(() => {
    if (isOpen) {
      loadBankOptions();
      loadPendingWithdrawals();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setStep('amount');
    setAmount('');
    setSelectedBank('');
    setAccountNumber('');
    setAccountName('');
    setError(null);
  };

  const loadBankOptions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('withdrawal_bank_options')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setBanks(data || []);
    } catch (error) {
      console.error('Error loading bank options:', error);
      setError('Failed to load bank options');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingWithdrawals = async () => {
    try {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('amount')
        .eq('telegram_user_id', telegramUserId)
        .in('status', ['pending', 'processing']);

      const total = data?.reduce((sum, w) => sum + Number(w.amount), 0) || 0;
      setPendingWithdrawals(total);
    } catch (error) {
      console.error('Error loading pending withdrawals:', error);
    }
  };

  const handleAmountNext = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (amountNum < 100) {
      setError('Minimum withdrawal amount is 100 ETB');
      return;
    }
    if (amountNum > availableBalance) {
      setError(`Insufficient balance. Available: ${availableBalance} ETB`);
      return;
    }
    setError(null);
    setStep('bank');
  };

  const handleBankNext = () => {
    if (!selectedBank) {
      setError('Please select a bank');
      return;
    }
    setError(null);
    setStep('account');
  };

  const handleAccountNext = () => {
    if (accountNumber.length < 8) {
      setError('Please enter a valid account number');
      return;
    }
    setError(null);
    setStep('name');
  };

  const handleNameNext = () => {
    if (accountName.trim().length < 3) {
      setError('Please enter a valid account holder name');
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('withdrawal_requests')
        .insert({
          telegram_user_id: telegramUserId,
          amount: parseFloat(amount),
          bank_name: selectedBank,
          account_number: accountNumber,
          account_name: accountName.trim(),
          status: 'pending'
        });

      if (insertError) throw insertError;

      onSuccess();
      onClose();
      resetForm();
    } catch (error: any) {
      console.error('Error submitting withdrawal:', error);
      setError(error.message || 'Failed to submit withdrawal request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 'bank') setStep('amount');
    else if (step === 'account') setStep('bank');
    else if (step === 'name') setStep('account');
    else if (step === 'confirm') setStep('name');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-yellow-600" />
            Bank Withdrawal
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700 dark:text-gray-300">Won Balance:</span>
                <span className="font-bold text-gray-900 dark:text-white">{wonBalance} ETB</span>
              </div>
              {pendingWithdrawals > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">Pending Withdrawals:</span>
                  <span className="font-bold text-yellow-600">{pendingWithdrawals} ETB</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-blue-300 dark:border-blue-600">
                <span className="text-gray-700 dark:text-gray-300">Available to Withdraw:</span>
                <span className="font-bold text-green-600 dark:text-green-400">{availableBalance} ETB</span>
              </div>
            </div>
          </div>

          {availableBalance < 100 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 text-lg font-semibold mb-2">
                Insufficient Balance
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Minimum withdrawal amount is 100 ETB
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                Keep playing to increase your withdrawable balance!
              </p>
            </div>
          ) : (
            <>
              {step === 'amount' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Withdrawal Amount (ETB)
                    </label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount (min: 100 ETB)"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      min="100"
                      max={availableBalance}
                      step="10"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Minimum: 100 ETB • Maximum: {availableBalance} ETB
                    </p>
                  </div>
                </div>
              )}

              {step === 'bank' && (
                <div className="space-y-4">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Select your bank:
                  </p>
                  {banks.map((bank) => (
                    <button
                      key={bank.id}
                      onClick={() => setSelectedBank(bank.bank_name)}
                      className={`w-full text-left border-2 rounded-xl p-4 transition-all ${
                        selectedBank === bank.bank_name
                          ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-yellow-400 bg-white dark:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-3 rounded-lg ${
                            selectedBank === bank.bank_name
                              ? 'bg-yellow-100 dark:bg-yellow-900/40'
                              : 'bg-gray-100 dark:bg-gray-600'
                          }`}>
                            <Building2 className={`w-6 h-6 ${
                              selectedBank === bank.bank_name
                                ? 'text-yellow-600'
                                : 'text-gray-600 dark:text-gray-300'
                            }`} />
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white">
                            {bank.bank_name}
                          </span>
                        </div>
                        {selectedBank === bank.bank_name && (
                          <CheckCircle className="w-6 h-6 text-yellow-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 'account' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Enter your account number"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {step === 'name' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Enter account holder name"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {step === 'confirm' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{amount} ETB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Bank:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{selectedBank}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Account:</span>
                      <span className="font-bold text-gray-900 dark:text-white font-mono">{accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Name:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{accountName}</span>
                    </div>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
                    <p className="text-sm text-yellow-800 dark:text-yellow-300">
                      <strong>Processing Time:</strong> Withdrawals are processed manually by admin, usually within 24 hours.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          {availableBalance >= 100 && (
            <div className="flex gap-3">
              {step !== 'amount' && (
                <button
                  onClick={handleBack}
                  disabled={isSubmitting}
                  className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => {
                  if (step === 'amount') handleAmountNext();
                  else if (step === 'bank') handleBankNext();
                  else if (step === 'account') handleAccountNext();
                  else if (step === 'name') handleNameNext();
                  else if (step === 'confirm') handleSubmit();
                }}
                disabled={isSubmitting || (step === 'amount' && !amount) || (step === 'bank' && !selectedBank) || (step === 'account' && !accountNumber) || (step === 'name' && !accountName)}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting...' : step === 'confirm' ? 'Submit Withdrawal' : 'Next'}
              </button>
            </div>
          )}
          {availableBalance < 100 && (
            <button
              onClick={onClose}
              className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
