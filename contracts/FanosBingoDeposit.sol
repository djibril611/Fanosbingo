// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FanosBingoDeposit {
    address public owner;
    uint256 public conversionRate; // Rate: 1 BNB = X game credits (scaled by 1e18)
    uint256 public minimumDeposit; // Minimum deposit in wei

    mapping(address => uint256) public totalDeposited;
    mapping(address => string) public walletToUserId;

    event Deposit(
        address indexed depositor,
        uint256 amount,
        string userId,
        uint256 gameCredits,
        uint256 timestamp
    );

    event Withdrawal(
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );

    event ConversionRateUpdated(
        uint256 oldRate,
        uint256 newRate,
        uint256 timestamp
    );

    event MinimumDepositUpdated(
        uint256 oldMinimum,
        uint256 newMinimum,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(uint256 _conversionRate, uint256 _minimumDeposit) {
        owner = msg.sender;
        conversionRate = _conversionRate; // e.g., 100000 * 1e18 means 1 BNB = 100,000 credits
        minimumDeposit = _minimumDeposit; // e.g., 0.001 BNB = 1000000000000000 wei
    }

    /**
     * @notice Deposit BNB to get game credits
     * @param userId The Telegram user ID to credit
     */
    function deposit(string memory userId) external payable {
        require(msg.value >= minimumDeposit, "Deposit amount too small");
        require(bytes(userId).length > 0, "User ID required");

        // Store or update user ID mapping
        if (bytes(walletToUserId[msg.sender]).length == 0) {
            walletToUserId[msg.sender] = userId;
        }

        // Calculate game credits
        uint256 gameCredits = (msg.value * conversionRate) / 1e18;

        // Update total deposited
        totalDeposited[msg.sender] += msg.value;

        // Emit deposit event
        emit Deposit(
            msg.sender,
            msg.value,
            userId,
            gameCredits,
            block.timestamp
        );
    }

    /**
     * @notice Owner can withdraw BNB to any address (used for player withdrawals)
     * @param recipient Address to send BNB to
     * @param amount Amount to withdraw in wei
     */
    function withdrawTo(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient contract balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");

        emit Withdrawal(recipient, amount, block.timestamp);
    }

    /**
     * @notice Owner can withdraw collected BNB to own address
     * @param amount Amount to withdraw in wei
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient contract balance");

        (bool success, ) = owner.call{value: amount}("");
        require(success, "Withdrawal failed");

        emit Withdrawal(owner, amount, block.timestamp);
    }

    /**
     * @notice Owner can withdraw all BNB to own address
     */
    function withdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success, ) = owner.call{value: balance}("");
        require(success, "Withdrawal failed");

        emit Withdrawal(owner, balance, block.timestamp);
    }

    /**
     * @notice Update conversion rate
     * @param newRate New conversion rate (scaled by 1e18)
     */
    function updateConversionRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be greater than 0");

        uint256 oldRate = conversionRate;
        conversionRate = newRate;

        emit ConversionRateUpdated(oldRate, newRate, block.timestamp);
    }

    /**
     * @notice Update minimum deposit
     * @param newMinimum New minimum deposit in wei
     */
    function updateMinimumDeposit(uint256 newMinimum) external onlyOwner {
        uint256 oldMinimum = minimumDeposit;
        minimumDeposit = newMinimum;

        emit MinimumDepositUpdated(oldMinimum, newMinimum, block.timestamp);
    }

    /**
     * @notice Transfer ownership
     * @param newOwner Address of new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    /**
     * @notice Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get user ID for a wallet address
     */
    function getUserId(address wallet) external view returns (string memory) {
        return walletToUserId[wallet];
    }

    /**
     * @notice Calculate game credits for a BNB amount
     */
    function calculateGameCredits(uint256 bnbAmount) external view returns (uint256) {
        return (bnbAmount * conversionRate) / 1e18;
    }
}
