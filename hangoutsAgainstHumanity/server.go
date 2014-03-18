package hangoutsagainsthumanity

import (
    "fmt"
    "net/http"
    "io/ioutil"
    "strings"
)

var whiteCardSets = map[string]string{
	"base" : "whiteBase.json",
	"first" : "whiteFirst.json",
	"second" : "whiteSecond.json",
	"third" : "whiteThird.json",
	"fourth" : "whiteFourth.json",
	"gall" : "whiteGallifrey.json",
}
var blackCardSets = map[string]string{
	"base" : "blackBase.json",
	"first" : "blackFirst.json",
	"second" : "blackSecond.json",
	"third" : "blackThird.json",
	"fourth" : "blackFourth.json",
	"gall" : "blackGallifrey.json",
}

func init() {
    http.HandleFunc("/white", makeHandler(whiteCardSets))
    http.HandleFunc("/black", makeHandler(blackCardSets))
}


func makeHandler (set map[string]string) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		cardSets := strings.Split(r.URL.Query().Get("sets"), " ")
		response := make([]string, len(cardSets))
		for index, elem := range cardSets {
			file, _ := ioutil.ReadFile(set[elem])
			response[index] = string(file)
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-type", "application/json")
	    fmt.Fprint(w, "[" + strings.Join(response, ",") + "]")
	}
}
