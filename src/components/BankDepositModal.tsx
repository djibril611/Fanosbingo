import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Building2, Copy, Check } from 'lucide-react';

interface BankOption {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  instructions: string;
  is_active: boolean;
  display_order: number;
}

interface BankDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  telegramUserId: number;
}

export function BankDepositModal({ isOpen, onClose, telegramUserId }: BankDepositModalProps) {
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [selectedBank, setSelectedBank] = useState<BankOption | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [supportContact, setSupportContact] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadBankOptions();
      loadSupportContact();
    }
  }, [isOpen]);

  const loadBankOptions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bank_options')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setBanks(data || []);
    } catch (error) {
      console.error('Error loading bank options:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSupportContact = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('id', 'support_contact')
        .maybeSingle();

      if (data) {
        setSupportContact(data.value);
      }
    } catch (error) {
      console.error('Error loading support contact:', error);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleBackToList = () => {
    setSelectedBank(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Bank Deposit
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedBank ? (
            <div className="space-y-6">
              <button
                onClick={handleBackToList}
                className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
              >
                ← Back to bank list
              </button>

              <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 rounded-xl p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {selectedBank.bank_name}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Account Number
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 font-mono text-lg font-bold text-gray-900 dark:text-white">
                        {selectedBank.account_number}
                      </div>
                      <button
                        onClick={() => handleCopy(selectedBank.account_number, 'account')}
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        {copiedField === 'account' ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Account Name
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 font-semibold text-gray-900 dark:text-white">
                        {selectedBank.account_name}
                      </div>
                      <button
                        onClick={() => handleCopy(selectedBank.account_name, 'name')}
                        className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        {copiedField === 'name' ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 rounded">
                <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">Instructions</h4>
                <div className="text-sm text-yellow-700 dark:text-yellow-400 whitespace-pre-line">
                  {selectedBank.instructions}
                </div>
              </div>

              {supportContact && (
                <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">
                    {supportContact}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>After making the deposit:</strong> Send the bank SMS confirmation to the Telegram bot, and your account will be credited automatically.
                </p>
              </div>
            </div>
          ) : banks.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                No bank options available at the moment
              </p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                Please contact support for assistance
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Select a bank to view deposit instructions:
              </p>
              {banks.map((bank) => (
                <button
                  key={bank.id}
                  onClick={() => setSelectedBank(bank)}
                  className="w-full text-left bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl p-4 transition-all hover:shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg">
                        <Building2 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                          {bank.bank_name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Click to view details
                        </p>
                      </div>
                    </div>
                    <div className="text-gray-400">→</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <button
            onClick={selectedBank ? handleBackToList : onClose}
            className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {selectedBank ? 'Back to Bank List' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
