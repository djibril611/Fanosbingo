// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FanosBingoDeposit {
    address public owner;
    uint256 public conversionRate;
    uint256 public minimumDeposit;

    uint256 public minWithdraw;
    uint256 public maxDaily;
    uint256 public maxWeekly;

    mapping(address => uint256) public totalDeposited;
    mapping(address => string) public walletToUserId;
    mapping(address => uint256) public credits;

    mapping(address => uint256) public dailyWithdrawn;
    mapping(address => uint256) public weeklyWithdrawn;
    mapping(address => uint256) public lastDailyReset;
    mapping(address => uint256) public lastWeeklyReset;

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

    event UserWithdrawal(
        address indexed user,
        uint256 amount,
        uint256 timestamp
    );

    event WinCreditsAdded(
        address indexed user,
        uint256 amount,
        uint256 newBalance,
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

    event WithdrawalLimitsUpdated(
        uint256 minWithdraw,
        uint256 maxDaily,
        uint256 maxWeekly,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor(uint256 _conversionRate, uint256 _minimumDeposit) {
        owner = msg.sender;
        conversionRate = _conversionRate;
        minimumDeposit = _minimumDeposit;
        minWithdraw = 0.01 ether;
        maxDaily = 5 ether;
        maxWeekly = 10 ether;
    }

    function deposit(string memory userId) external payable {
        require(msg.value >= minimumDeposit, "Deposit amount too small");
        require(bytes(userId).length > 0, "User ID required");

        if (bytes(walletToUserId[msg.sender]).length == 0) {
            walletToUserId[msg.sender] = userId;
        }

        uint256 gameCredits = (msg.value * conversionRate) / 1e18;
        totalDeposited[msg.sender] += msg.value;

        emit Deposit(
            msg.sender,
            msg.value,
            userId,
            gameCredits,
            block.timestamp
        );
    }

    function addWinCredits(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "Invalid user address");
        require(amount > 0, "Amount must be greater than 0");

        credits[user] += amount;

        emit WinCreditsAdded(user, amount, credits[user], block.timestamp);
    }

    function withdraw(uint256 amount) external {
        require(amount >= minWithdraw, "Below minimum withdrawal");
        require(credits[msg.sender] >= amount, "Insufficient credits");
        require(address(this).balance >= amount, "Insufficient contract balance");

        _resetLimitsIfNeeded(msg.sender);

        require(dailyWithdrawn[msg.sender] + amount <= maxDaily, "Daily limit exceeded");
        require(weeklyWithdrawn[msg.sender] + amount <= maxWeekly, "Weekly limit exceeded");

        credits[msg.sender] -= amount;
        dailyWithdrawn[msg.sender] += amount;
        weeklyWithdrawn[msg.sender] += amount;

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit UserWithdrawal(msg.sender, amount, block.timestamp);
    }

    function _resetLimitsIfNeeded(address user) internal {
        if (block.timestamp >= lastDailyReset[user] + 1 days) {
            dailyWithdrawn[user] = 0;
            lastDailyReset[user] = block.timestamp;
        }
        if (block.timestamp >= lastWeeklyReset[user] + 7 days) {
            weeklyWithdrawn[user] = 0;
            lastWeeklyReset[user] = block.timestamp;
        }
    }

    function getRemainingLimits(address user) external view returns (
        uint256 dailyRemaining,
        uint256 weeklyRemaining
    ) {
        uint256 currentDaily = dailyWithdrawn[user];
        uint256 currentWeekly = weeklyWithdrawn[user];

        if (block.timestamp >= lastDailyReset[user] + 1 days) {
            currentDaily = 0;
        }
        if (block.timestamp >= lastWeeklyReset[user] + 7 days) {
            currentWeekly = 0;
        }

        dailyRemaining = maxDaily > currentDaily ? maxDaily - currentDaily : 0;
        weeklyRemaining = maxWeekly > currentWeekly ? maxWeekly - currentWeekly : 0;
    }

    function withdrawTo(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        require(amount <= address(this).balance, "Insufficient contract balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Withdrawal failed");

        emit Withdrawal(recipient, amount, block.timestamp);
    }

    function withdrawAll() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");

        (bool success, ) = owner.call{value: balance}("");
        require(success, "Withdrawal failed");

        emit Withdrawal(owner, balance, block.timestamp);
    }

    function setWithdrawalLimits(
        uint256 _minWithdraw,
        uint256 _maxDaily,
        uint256 _maxWeekly
    ) external onlyOwner {
        require(_maxDaily > 0 && _maxWeekly > 0, "Limits must be greater than 0");
        require(_maxWeekly >= _maxDaily, "Weekly limit must be >= daily limit");

        minWithdraw = _minWithdraw;
        maxDaily = _maxDaily;
        maxWeekly = _maxWeekly;

        emit WithdrawalLimitsUpdated(_minWithdraw, _maxDaily, _maxWeekly, block.timestamp);
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function updateConversionRate(uint256 newRate) external onlyOwner {
        require(newRate > 0, "Rate must be greater than 0");

        uint256 oldRate = conversionRate;
        conversionRate = newRate;

        emit ConversionRateUpdated(oldRate, newRate, block.timestamp);
    }

    function updateMinimumDeposit(uint256 newMinimum) external onlyOwner {
        uint256 oldMinimum = minimumDeposit;
        minimumDeposit = newMinimum;

        emit MinimumDepositUpdated(oldMinimum, newMinimum, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getUserId(address wallet) external view returns (string memory) {
        return walletToUserId[wallet];
    }

    function calculateGameCredits(uint256 bnbAmount) external view returns (uint256) {
        return (bnbAmount * conversionRate) / 1e18;
    }

    receive() external payable {}
}
