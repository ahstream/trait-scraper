
yarn cli resetLogFiles
yarn cli resetDB
yarn cli initOddsHistoryDB

yarn cli crawlMatchPages --interval 1 --datestr 20210627 --sport "soccer" --daysAfter 0 --daysBefore 1
yarn cli crawlMatchPages --interval 5 --sport "soccer" --daysAfter 2 --daysBefore 15
yarn cli crawlMatchPages --interval 500 --sport "soccer" --daysAfter 300 --daysBefore 1
yarn cli crawlMatchPages --interval 5000 --sport "tennis" --daysAfter 300 --daysBefore 1

yarn cli crawlMatchLinks --interval 5 --status ""

yarn cli crawlMatchPages --interval 5000 --sport "basketball" --daysAfter 30 --daysBefore 30
yarn cli crawlMatchPages --interval 5000 --sport "baseball" --daysAfter 30 --daysBefore 30
yarn cli crawlMatchPages --interval 5000 --sport "hockey" --daysAfter 30 --daysBefore 30
yarn cli crawlMatchPages --interval 5000 --sport "handball" --daysAfter 30 --daysBefore 60
yarn cli crawlMatchPages --interval 5000 --sport "american-football" --daysAfter 30 --daysBefore 60
yarn cli crawlMatchPages --interval 5000 --sport "darts" --daysAfter 30 --daysBefore 60
yarn cli crawlMatchPages --interval 5000 --sport "rugby-league" --daysAfter 100 --daysBefore 60
yarn cli crawlMatchPages --interval 5000 --sport "rugby-union" --daysAfter 100 --daysBefore 60


yarn cli crawlMatchPages --interval 5000 --sport "water-polo" --daysAfter 100 --daysBefore 60
yarn cli crawlMatchPages --interval 5000 --sport "beach-soccer" --daysAfter 100 --daysBefore 60
yarn cli crawlMatchPages --interval 5000 --sport "beach-volleyballn" --daysAfter 100 --daysBefore 60


    "aussie-rules": 18,
    "badminton": 21,
    "bandy": 10,
    "boxing": 16,
    "cricket": 13,
    "esports": 36,
    "floorball": 9,
    "futsal": 11,
    "mma": 28,
    "snooker": 15,
    "volleyball": 12,


