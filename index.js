const express = require('express');
const cors = require('cors'); // Import cors
const yahooFinance = require('yahoo-finance2').default;
const data = require('./symbol')
const app = express();
const PORT = 5000;


app.use(cors()); // Enable CORS for all routes

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(symbol, queryOptions, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const data = await yahooFinance.chart(symbol, queryOptions);
            return data; // Return data if successful
        } catch (error) {
            if (error.message.includes('Too Many Requests')) {
                console.warn(`Too many requests. Retrying after ${2 ** i} seconds...`);
                await delay(2 ** i * 1000); // Exponential backoff
            } else {
                console.error('Error fetching data:', error);
                throw error; // Re-throw if it's not a rate limit error
            }
        }
    }
    throw new Error('Max retries exceeded');
}

app.get('/stock/analyze/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol + '.NS';

        // Define the start and end dates
        const dailyPeriod1 = new Date(new Date().setDate(new Date().getDate() - 1)); // 1 day ago
        const dailyPeriod2 = new Date(); // current date

        const today = new Date();
        if (today.getDay() === 0) { // Sunday
            dailyPeriod2.setDate(dailyPeriod2.getDate() - 2); // Set to Friday
            dailyPeriod1.setDate(dailyPeriod1.getDate() - 2); // Adjust start date to last Friday
        } else if (today.getDay() === 6) { // Saturday
            dailyPeriod2.setDate(dailyPeriod2.getDate() - 1); // Set to Friday
            dailyPeriod1.setDate(dailyPeriod1.getDate() - 1); // Adjust start date to last Friday
        }

        const weeklyPeriod1 = new Date(new Date().setMonth(new Date().getMonth() - 6)); // 6 months ago
        const weeklyPeriod2 = new Date(); // current date

        const yearlyPeriod1 = new Date(new Date().setFullYear(new Date().getFullYear() - 1)); // 1 year ago
        const yearlyPeriod2 = new Date(); // current date

        // Query options for daily, weekly, and yearly data
        const dailyQueryOptions = { interval: '1d', period1: dailyPeriod1, period2: dailyPeriod2 };
        const weeklyQueryOptions = { interval: '1wk', period1: weeklyPeriod1, period2: weeklyPeriod2 };
        const yearlyQueryOptions = { interval: '1mo', period1: yearlyPeriod1, period2: yearlyPeriod2 };

        // Fetch daily, weekly, and yearly data
        // const [dailyData, weeklyData, yearlyData] = await Promise.all([
        //     yahooFinance.chart(symbol, dailyQueryOptions),
        //     yahooFinance.chart(symbol, weeklyQueryOptions),
        //     yahooFinance.chart(symbol, yearlyQueryOptions)
        // ]);

        const dailyData = await fetchWithRetry(symbol, dailyQueryOptions);
        const weeklyData = await fetchWithRetry(symbol, weeklyQueryOptions);
        const yearlyData = await fetchWithRetry(symbol, yearlyQueryOptions);

        const dailyPriceData = dailyData.quotes.map(item => ({
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            date: new Date(item.timestamp * 1000) // Convert Unix timestamp to JS Date
        }));

        const weeklyPriceData = weeklyData.quotes.map(item => ({
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            date: new Date(item.timestamp * 1000) // Convert Unix timestamp to JS Date
        }));

        const yearlyPriceData = yearlyData.quotes.map(item => ({
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            date: new Date(item.timestamp * 1000) // Convert Unix timestamp to JS Date
        }));

        console.log(dailyPriceData)
        // Calculate support and resistance for daily, weekly, and yearly data
        const dailySupportResistance = calculateSupportResistance(dailyPriceData);
        const weeklySupportResistance = calculateSupportResistance(weeklyPriceData);
        const yearlySupportResistance = calculateSupportResistance(yearlyPriceData);

        // Calculate EMA for daily, weekly, and yearly data
        const dailyEMA = calculateEMA(dailyPriceData, 5); // 5-day EMA
        const weeklyEMA = calculateEMA(weeklyPriceData, 5); // 5-day EMA
        const yearlyEMA = calculateEMA(yearlyPriceData, 5); // 5-day EMA

        console.log(dailyPriceData.length)
        const currentDailyPrice = dailyPriceData[dailyPriceData.length - 1].close;
        const currentWeeklyPrice = weeklyPriceData[weeklyPriceData.length - 1].close;
        const currentYearlyPrice = yearlyPriceData[yearlyPriceData.length - 1].close;

        const isGoodDailyBuy = currentDailyPrice > dailyEMA; // Daily buy signal
        const isGoodWeeklyBuy = currentWeeklyPrice > weeklyEMA; // Weekly buy signal
        const isGoodYearlyBuy = currentYearlyPrice > yearlyEMA; // Yearly buy signal

        // Estimate days to reach resistance levels for daily, weekly, and yearly data
        const dailyResistanceLevels = calculateResistanceLevels(dailySupportResistance.resistance, dailyPriceData);
        const weeklyResistanceLevels = calculateResistanceLevels(weeklySupportResistance.resistance, weeklyPriceData);
        const yearlyResistanceLevels = calculateResistanceLevels(yearlySupportResistance.resistance, yearlyPriceData);

        const dailyDaysToReachLevels = dailyResistanceLevels.map(level => ({
            level: level,
            days: estimateDaysToReachResistance(dailyPriceData, level)
        }));

        const weeklyDaysToReachLevels = weeklyResistanceLevels.map(level => ({
            level: level,
            days: estimateDaysToReachResistance(weeklyPriceData, level)
        }));
        const yearlyDaysToReachLevels = yearlyResistanceLevels.map(level => ({
            level: level,
            days: estimateDaysToReachResistance(yearlyPriceData, level)
        }));

        const relevantDailyLevels = dailyDaysToReachLevels.filter(item => item.days <= 10 && item.days > 0);
        const relevantWeeklyLevels = weeklyDaysToReachLevels.filter(item => item.days <= 60 && item.days > 0);
        const relevantYearlyLevels = yearlyDaysToReachLevels.filter(item => item.days <= 365 && item.days > 0);

        const dailyPatterns = detectPatterns(dailyPriceData);
        const weeklyPatterns = detectPatterns(weeklyPriceData);
        const yearlyPatterns = detectPatterns(yearlyPriceData);

        const bestDailyBuyLevel = findBestBuyLevel(dailySupportResistance, dailyPriceData, dailyEMA);
        const bestWeeklyBuyLevel = findBestBuyLevel(weeklySupportResistance, weeklyPriceData, weeklyEMA);
        const bestYearlyBuyLevel = findBestBuyLevel(yearlySupportResistance, yearlyPriceData, yearlyEMA);

        const dailyDatas = await fetchHistoricalData(symbol, '1d');

        // Fetch weekly data
        const weeklyDatas = await fetchHistoricalData(symbol, '1wk');

        // Fetch monthly data
        const monthlyDatas = await fetchHistoricalData(symbol, '1mo');

        // Check if data was fetched
        if (dailyDatas.length === 0) {
            return res.status(404).json({ error: 'No historical data available' });
        }
        // Check if data was fetched
        if (weeklyDatas.length === 0) {
            return res.status(404).json({ error: 'No historical data available' });
        }

        // Check if data was fetched
        if (monthlyDatas.length === 0) {
            return res.status(404).json({ error: 'No historical data available' });
        }

        // Calculate RSI from the fetched data
        const dailyRsi = calculateRSI(dailyDatas);
        const isDailyGoodBuyRSI = isGoodBuyBasedOnRSI(dailyRsi);

        // Calculate RSI from the fetched data
        const weeklyRsi = calculateRSI(weeklyDatas);
        const isWeeklyGoodBuyRSI = isGoodBuyBasedOnRSI(weeklyRsi);

        // Calculate RSI from the fetched data
        const monthlyRsi = calculateRSI(monthlyDatas);
        const isYearlyGoodBuyRSI = isGoodBuyBasedOnRSI(monthlyRsi);

        // Example: Calculate SMA/EMA for daily, weekly, and yearly data
        const dailyShortTermEMA = calculateEMA(dailyPriceData, 5); // 5-day EMA
        const dailyLongTermEMA = calculateEMA(dailyPriceData, 20); // 20-day EMA

        const weeklyShortTermEMA = calculateEMA(weeklyPriceData, 5); // 5-week EMA
        const weeklyLongTermEMA = calculateEMA(weeklyPriceData, 20); // 20-week EMA

        const yearlyShortTermEMA = calculateEMA(yearlyPriceData, 5); // 5-month EMA
        const yearlyLongTermEMA = calculateEMA(yearlyPriceData, 20); // 20-month EMA

        // Determine if it's a good buy based on daily, weekly, and yearly data
        const isGoodDailyMAC = isGoodBuyBasedOnMA(dailyShortTermEMA, dailyLongTermEMA);
        const isGoodWeeklyMAC = isGoodBuyBasedOnMA(weeklyShortTermEMA, weeklyLongTermEMA);
        const isGoodYearlyMAC = isGoodBuyBasedOnMA(yearlyShortTermEMA, yearlyLongTermEMA);

        // Return combined results
        res.json({
            daily: {
                bestBuyLevel: bestDailyBuyLevel,
                support: dailySupportResistance.support,
                resistance: dailySupportResistance.resistance,
                emaValue: dailyEMA,
                isGoodBuy: isGoodDailyBuy,
                currentPrice: currentDailyPrice,
                relevantResistanceLevels: relevantDailyLevels,
                dailyPatterns: dailyPatterns,
                isGoodBuyRSI: isDailyGoodBuyRSI,
                isGoodMAC: isGoodDailyMAC
            },
            weekly: {
                bestBuyLevel: bestWeeklyBuyLevel,
                support: weeklySupportResistance.support,
                resistance: weeklySupportResistance.resistance,
                emaValue: weeklyEMA,
                isGoodBuy: isGoodWeeklyBuy,
                currentPrice: currentWeeklyPrice,
                relevantResistanceLevels: relevantWeeklyLevels,
                weeklyPatterns: weeklyPatterns,
                isGoodBuyRSI: isWeeklyGoodBuyRSI,
                isGoodMAC: isGoodWeeklyMAC
            },
            yearly: {
                bestBuyLevel: bestYearlyBuyLevel,
                support: yearlySupportResistance.support,
                resistance: yearlySupportResistance.resistance,
                emaValue: yearlyEMA,
                isGoodBuy: isGoodYearlyBuy,
                currentPrice: currentYearlyPrice,
                relevantResistanceLevels: relevantYearlyLevels,
                yearlyPatterns: yearlyPatterns,
                isGoodBuyRSI: isYearlyGoodBuyRSI,
                isGoodMAC: isGoodYearlyMAC
            }
        });
    } catch (error) {
        console.error(error); // Log error for debugging
        res.status(500).json({ error: 'Error analyzing stock data' });
    }

});

// Determine Buy Signal based on Moving Averages
const isGoodBuyBasedOnMA = (shortTermMA, longTermMA) => {
    if (!shortTermMA || !longTermMA) return null; // Not enough data points
    return shortTermMA > longTermMA ? true : false;
};

const fetchHistoricalData = async (symbol, interval = '1d') => {
    // Define the date range
    const endDate = new Date();
    let startDate;

    // Set the start date based on the interval
    if (interval === '1d') {
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1); // 1 year ago for daily
    } else if (interval === '1wk') {
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 6); // 6 months ago for weekly
    } else if (interval === '1mo') {
        startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1); // 1 year ago for monthly (could be adjusted)
    } else {
        throw new Error('Unsupported interval'); // Handle unsupported intervals
    }

    try {
        // Fetch historical data for the specified interval
        const queryOptions = {
            period1: startDate.toISOString().split('T')[0], // Start date
            period2: endDate.toISOString().split('T')[0],     // End date
            interval: interval,                               // Interval passed as argument
        };

        const result = await yahooFinance.historical(symbol, queryOptions);

        // Log the fetched data
        console.log(`Fetched historical data for ${symbol} with interval ${interval}:`, result);

        return result; // Return the fetched historical data
    } catch (error) {
        console.error('Error fetching historical data:', error);
        return []; // Return an empty array on error
    }
};

const calculateRSI = (data, period = 12) => {
    if (data.length < period) {
        console.warn(`Not enough data to calculate RSI, required: ${period}, received: ${data.length}`);
        return []; // Not enough data points
    }

    let rsi = [];
    for (let i = period; i < data.length; i++) {
        const gains = [];
        const losses = [];
        for (let j = i - period; j < i; j++) {
            const difference = data[j + 1].close - data[j].close;
            if (difference > 0) gains.push(difference);
            else losses.push(-difference);
        }
        const averageGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
        const averageLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
        const rs = averageLoss === 0 ? 0 : averageGain / averageLoss;
        rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
};

const isGoodBuyBasedOnRSI = (rsi) => {
    const latestRSI = rsi[rsi.length - 1]; // Get the latest RSI value
    const previousRSI = rsi[rsi.length - 2];
    if (latestRSI > previousRSI && latestRSI > 30 && latestRSI < 70) {
        return true; // Buy signal for upward trend within moderate RSI range
    } else if (latestRSI > 70 && latestRSI < previousRSI) {
        return false; // Sell signal
    }
    return null; // Neutral, no action
};


// Function to calculate support and resistance levels
function calculateSupportResistance(data) {
    const prices = data.map(item => ({
        high: item.high,
        low: item.low
    }));

    const support = Math.min(...prices.map(p => p.low));
    const resistance = Math.max(...prices.map(p => p.high));

    const daysToReachResistance = estimateDaysToReachResistance(data, resistance);

    return { support, resistance, daysToReachResistance };
    //return { support, resistance };
}

// Function to calculate the Exponential Moving Average (EMA)
function calculateEMA(data, period) {
    let k = 2 / (period + 1); // Smoothing factor
    let ema = data.slice(0, period).reduce((sum, item) => sum + item.close, 0) / period; // Initial EMA (SMA for first 'n' periods)

    for (let i = period; i < data.length; i++) {
        ema = data[i].close * k + ema * (1 - k);
    }

    return ema;
}

// Function to estimate days to reach resistance
function estimateDaysToReachResistance(data, resistance) {
    const closingPrices = data.map(item => item.close);

    // Calculate daily price changes
    const priceChanges = closingPrices.slice(1).map((price, index) => price - closingPrices[index]);

    // Calculate the average daily price change
    const averageDailyChange = priceChanges.reduce((acc, change) => acc + change, 0) / priceChanges.length;

    const currentPrice = closingPrices[closingPrices.length - 1];

    // Check if the current price is already at or above resistance
    if (currentPrice >= resistance) {
        return 0; // Already reached or above resistance
    }


    // Calculate how many days it would take to reach resistance
    const daysToReachResistance = (resistance - currentPrice) / averageDailyChange;

    return Math.ceil(daysToReachResistance > 0 ? daysToReachResistance : 0); // Round up to the nearest whole number
}


// Function to calculate multiple resistance levels (R1, R2, R3)
function calculateResistanceLevels(resistance, data) {
    const lastPrice = data[data.length - 1].close;

    const R1 = resistance + (resistance - lastPrice) * 0.382; // R1: 38.2% retracement level
    const R2 = resistance + (resistance - lastPrice) * 0.618; // R2: 61.8% retracement level
    const R3 = resistance + (resistance - lastPrice);         // R3: full retracement level

    return [R1, R2, R3];
}

function detectPatterns(data) {
    return {
        headAndShoulders: isHeadAndShoulders(data),
        inverseHeadAndShoulders: isInverseHeadAndShoulders(data),
        doubleTop: isDoubleTop(data),
        doubleBottom: isDoubleBottom(data),
        ascendingTriangle: isAscendingTriangle(data),
        descendingTriangle: isDescendingTriangle(data),
        symmetricalTriangle: isSymmetricalTriangle(data),
        cupAndHandle: isCupAndHandle(data),
        wPattern: isWPattern(data),
    };
}

// Function to check for Head and Shoulders
function isHeadAndShoulders(data) {
    if (data.length < 5) return false; // Not enough data

    const highs = data.map(d => d.high);

    // Check for left shoulder, head, right shoulder pattern
    const leftShoulder = highs[0];
    const head = Math.max(...highs.slice(1, -1));
    const rightShoulder = highs[highs.length - 1];

    return leftShoulder > head && rightShoulder > head;
}

// Function to check for Inverse Head and Shoulders
function isInverseHeadAndShoulders(data) {
    if (data.length < 5) return false; // Not enough data

    const lows = data.map(d => d.low);

    // Check for left shoulder, head, right shoulder pattern
    const leftShoulder = lows[0];
    const head = Math.min(...lows.slice(1, -1));
    const rightShoulder = lows[lows.length - 1];

    return leftShoulder < head && rightShoulder < head;
}

// Function to check for Double Top
function isDoubleTop(data) {
    if (data.length < 5) return false; // Not enough data

    const highs = data.map(d => d.high);
    const peak1 = highs[0];
    const peak2 = highs[highs.length - 1];

    // Check if peaks are approximately equal
    return Math.abs(peak1 - peak2) < (peak1 * 0.05); // Allowing for 5% deviation
}

// Function to check for Double Bottom
function isDoubleBottom(data) {
    if (data.length < 5) return false; // Not enough data

    const lows = data.map(d => d.low);
    const trough1 = lows[0];
    const trough2 = lows[lows.length - 1];

    // Check if troughs are approximately equal
    return Math.abs(trough1 - trough2) < (trough1 * 0.05); // Allowing for 5% deviation
}

// Function to check for Ascending Triangle
function isAscendingTriangle(data) {
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    const flatTop = highs[0]; // Assume the top is the first high
    let higherLowsCount = 0;

    for (let i = 1; i < lows.length; i++) {
        if (lows[i] > lows[i - 1]) {
            higherLowsCount++;
        }
    }

    return higherLowsCount >= 2 && highs[highs.length - 1] === flatTop; // At least 2 higher lows and flat top
}

// Function to check for Descending Triangle
function isDescendingTriangle(data) {
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    const flatBottom = lows[lows.length - 1]; // Assume the bottom is the last low
    let lowerHighsCount = 0;

    for (let i = 1; i < highs.length; i++) {
        if (highs[i] < highs[i - 1]) {
            lowerHighsCount++;
        }
    }

    return lowerHighsCount >= 2 && lows[0] === flatBottom; // At least 2 lower highs and flat bottom
}

// Function to check for Symmetrical Triangle
function isSymmetricalTriangle(data) {
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    // Check if highs are descending and lows are ascending
    const isDescendingHighs = highs.slice(1).every((high, i) => high < highs[i]);
    const isAscendingLows = lows.slice(1).every((low, i) => low > lows[i]);

    return isDescendingHighs && isAscendingLows;
}

// Function to check for Cup and Handle
function isCupAndHandle(data) {
    const lows = data.map(d => d.low);
    const cupDepth = Math.min(...lows);

    // Check for a rounded bottom (cup) followed by a slight pullback (handle)
    const cupFormed = lows[0] === cupDepth && lows[lows.length - 1] > cupDepth;

    return cupFormed;
}

// Function to check for W Pattern
function isWPattern(data) {
    const lows = data.map(d => d.low);

    // Look for two troughs with a peak in between
    const trough1 = lows[0];
    const peak = Math.max(...lows.slice(1, lows.length - 1));
    const trough2 = lows[lows.length - 1];

    return trough1 < peak && trough2 < peak; // Both troughs must be lower than the peak
}

function findBestBuyLevel(supportResistance, priceData, ema) {
    const supportLevel = supportResistance.support;
    const currentPrice = priceData[priceData.length - 1].close;

    // If the current price is close to the support level, it might be a good buy
    if (currentPrice <= supportLevel * 1.05) {
        return supportLevel; // Current price is within 5% of the support level
    }

    // Use EMA as a potential buy level
    if (currentPrice <= ema * 1.05) {
        return ema; // Current price is within 5% of the EMA
    }

    return Math.min(supportLevel, ema); // Return the lower value between support level and EMA
}


app.get('/', async (req, res) => {
    res.send('Hello User')
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
