/* global gapi,angular */
'use strict';

function drawCardFromDeck(getJSONValue, setJSONValue, deckKey) {
  var get = getJSONValue.bind(null, deckKey),
      set = setJSONValue.bind(null, deckKey);

  return function(num) {
    var deck = get(),
        deckLen = deck.length,
        cards = [],
        number = num || 1;

    if(number < deckLen) {
      cards = deck.splice(0, number);
    } else {
      cards = deck;
      deck = [];
    }

    set(deck);
    return cards;
  };
}

angular.module('HangoutsAgainstHumanity', ['ngAnimate'])
  .factory('submitDelta', ['$timeout', function($timeout) {
    var next_submit,
        d, r;
    return function(delta, remove) {
      if(!next_submit) {
        d = {};
        r = [];
        next_submit = $timeout(function() {
          gapi.hangout.data.submitDelta(d, r);
          next_submit = undefined;
        }, 20);
      }
      for (var i in delta) {
        d[i] = JSON.stringify(delta[i] || null);
      }
      for (var j in remove) {
        if(r.indexOf(remove[j]) === -1) {
          r.push(remove[j]);
        }
      }
    };
  }])
  .factory('setJSONValue', ['submitDelta', function(submitDelta) {
    return function(key, value) {
      var delta = {};
      delta[key] = value;
      submitDelta(delta);
    };
  }])
  .constant('getJSONValue', function(key) { return JSON.parse(gapi.hangout.data.getValue(key) || null); })
  .constant('whiteCardKey', 'white_cards')
  .constant('blackCardKey', 'black_cards')
  .constant('activeBlackCardKey', 'active_black_card')
  .constant('currentReaderKey', 'current_reader')
  .constant('currentStateKey', 'current_state')
  .constant('winnerKey', 'winner')
  .constant('listeningForSubmissionKey', 'listening')
  .constant('shuffle', function(array) {
    var i, j, swapped,
        arrLen = array.length;

    for (i = ((arrLen - 1) * 3); i >= 0; i--) {
      j = Math.floor(Math.random() * arrLen);
      swapped = array[i % arrLen];
      array[i % arrLen] = array[j];
      array[j] = swapped;
    }

    return array;
  })
  .factory('localParticipantId', function() {
    return gapi.hangout.getLocalParticipantId();
  })
  .factory('localParticipantCards', ['localParticipantId', function(localParticipantId) {
    return 'cards_' + localParticipantId;
  }])
  .factory('localParticipantNewCards', ['localParticipantId', function(localParticipantId) {
    return 'new_' + localParticipantId;
  }])
  .factory('drawWhiteCards', ['getJSONValue', 'setJSONValue', 'whiteCardKey', drawCardFromDeck])
  .factory('drawBlackCards', ['getJSONValue', 'setJSONValue', 'blackCardKey', drawCardFromDeck])
  .factory('drawNewQuestion', ['drawBlackCards', 'setJSONValue', 'activeBlackCardKey', function(drawBlackCards, setJSONValue, activeBlackCardKey) {
    return function() {
      setJSONValue(activeBlackCardKey, drawBlackCards(1)[0]);
    };
  }])
  .factory('submitCards', ['setJSONValue', 'localParticipantCards', 'whiteCards', function(setJSONValue, localParticipantCards, whiteCards) {
    var white;
    whiteCards().then(function(cards) {
      white = cards;
    });
    return function(cards) {
      var cardIds = [], i = 0, len = cards.length;

      for( ; i < len ; i++) {
        cardIds[i] = white.indexOf(cards[i]);
      }

      setJSONValue(localParticipantCards, cardIds);
    };
  }])
  .factory('watchForNewParticipants', [function() {
    return function(callback) {
      var func = function(evt) {
            callback(evt.enabledParticipants);
          },
          cancel = function() {
            gapi.hangout.onParticipantsEnabled.remove(func);
          };

      gapi.hangout.onParticipantsEnabled.add(func);
      return cancel;
    };
  }])
  .factory('watchForSubmittedCards', ['$filter', 'getJSONValue', 'submitDelta', 'listeningForSubmissionKey', 'whiteCards', function($filter, getJSONValue, submitDelta, listeningForSubmissionKey, whiteCards) {
    return function(callback) {
      var func = function(evt) {
            var newCards = $filter('filter')(evt.addedKeys, function(x) {
              return x.key.search('cards_') === 0;
            });
            whiteCards().then(function(white) {
              angular.forEach(newCards, function(obj) {
                obj.value = getJSONValue(obj.key);
                angular.forEach(obj.value, function(cardId, i) {
                  obj.value[i] = white[cardId];
                });
              });
              if(!!newCards.length) {
                callback(newCards);
              }
            });
          },
          cancel = function() {
            gapi.hangout.data.onStateChanged.remove(func);
            delta[listeningForSubmissionKey] = false;
            submitDelta(delta);
          },
          delta = {};

      delta[listeningForSubmissionKey] = true;
      submitDelta(delta);
      gapi.hangout.data.onStateChanged.add(func);

      return cancel;
    };
  }])
  .factory('sendCards', ['submitDelta', function(submitDelta) {

    return function(arrayOfCardsToPlayers) {
      var delta = {},
          remove = [];

      angular.forEach(arrayOfCardsToPlayers, function(cardsToPlayer) {
        delta['new_' + cardsToPlayer.player] = cardsToPlayer.cards;
        remove.push('cards_' + cardsToPlayer.player);
      });

      submitDelta(delta, remove);
    };
  }])
  .factory('whiteCards', ['$http', '$q', function($http, $q) {
    var whiteCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/whitecards.json').then(function(response) {
          return (whiteCards = response.data);
        });
    return function() {
      if(!whiteCards) {
        return promise;
      } else {
        return $q.when(whiteCards);
      }
    };
  }])
  .factory('blackCards', ['$http', '$q', function($http, $q) {
    var blackCards,
        promise = $http.get('//hangouts-against-humanity.appspot.com/static/blackcards.json').then(function(response) {
          return (blackCards = response.data);
        });
    return function() {
      if(!blackCards) {
        return promise;
      } else {
        return $q.when(blackCards);
      }
    };
  }])
  .factory('transferToNextPlayer', ['submitDelta', 'currentReaderKey', 'activeBlackCardKey', 'localParticipantId', function(submitDelta, readerKey, activeBlackCardKey, myId) {
    return function() {
      var delta = {},
          participants = gapi.hangout.getEnabledParticipants().map(function(p) { return p.id; }).sort(),
          me = participants.indexOf(myId),
          next = (me + 1) % participants.length;

      delta[activeBlackCardKey] = '';
      delta[readerKey] = participants[next];

      submitDelta(delta);
    };
  }])
  .factory('returnCards', ['sendCards', 'drawWhiteCards', function(sendCards, drawWhiteCards) {
    return function(submittedPlayers) {
      var newCards = drawWhiteCards(submittedPlayers.reduce(function(y, a) { return y + a.cards.length; }, 0));
      angular.forEach(submittedPlayers, function(players) {
          players.cards = newCards.splice(0, players.cards.length);
      });

      sendCards(submittedPlayers);
    };
  }])
  .run(['submitDelta', 'shuffle', 'whiteCardKey', 'blackCardKey', 'currentReaderKey', 'localParticipantId', 'sendCards', 'whiteCards', 'blackCards', '$q',/* Not strictly needed, but we want to fire it off initially with module#run */ 'gameState', function(submitDelta, shuffle, whiteCardKey, blackCardKey, currentReaderKey, localParticipantId, sendCards, whiteCards, blackCards, $q) {

    function saveDeck(cardKey) {
      return function(cardIds) {
        var x = {};
        x[cardKey] = cardIds;
        submitDelta(x);
      };
    }

    function buildDeck(cards) {
      var c = [],
          i = 0, len = cards.length;

      for( ; i < len ; i++) {
        c[i] = i;
      }
      return shuffle(c);
    }

    function ifNotAlreadySaved(cardKey) {
      return function(cards) {
        if (angular.isUndefined(gapi.hangout.data.getValue(cardKey))) {
          return cards;
        } else {
          return $q.reject();
        }
      };
    }

    whiteCards()
      .then(ifNotAlreadySaved(whiteCardKey))
      .then(buildDeck)
      .then(function pullMyCards(cardIds) {
        if(angular.isUndefined(gapi.hangout.data.getValue(currentReaderKey))) {
          var x = {};
          x[currentReaderKey] = localParticipantId;
          submitDelta(x);

          sendCards([
            {
              player: localParticipantId,
              cards: cardIds.splice(0,10)
            }]);
        }
        return cardIds;
      })
      .then(saveDeck(whiteCardKey));

    blackCards()
      .then(ifNotAlreadySaved(blackCardKey))
      .then(buildDeck)
      .then(saveDeck(blackCardKey));

  }])
  .factory('gameState', ['activeBlackCardKey', 'currentReaderKey', 'listeningForSubmissionKey', 'localParticipantNewCards', 'getJSONValue', 'whiteCards', 'blackCards', '$rootScope', function(activeBlackCardKey, currentReaderKey, listeningForSubmissionKey, localParticipantNewCards, getJSONValue, whiteCards, blackCards, $rootScope) {
    var item = {},
        white, black;

    whiteCards().then(function(cards) {
      var newCards = getJSONValue(localParticipantNewCards);
      item.newCards = [];
      if (angular.isArray(newCards)) {
        angular.forEach(newCards, function(cardId, i) {
          item.newCards[i] = cards[cardId];
        });
      }
      return cards;
    }).then(function(cards) {
      white = cards;
    });
    blackCards().then(function(cards) {
      var activeQuestion = getJSONValue(activeBlackCardKey);
      item.activeQuestion = cards[activeQuestion || ''] || { text: '' };
      return cards;
    }).then(function(cards) {
      black = cards;
    });
    item.currentReader = getJSONValue(currentReaderKey);
    item.canSubmit = getJSONValue(listeningForSubmissionKey);

    gapi.hangout.data.onStateChanged.add(
      function(evt) {
        var questionChange,
            readerChange,
            canSubmit,
            newCards;

        questionChange = evt.addedKeys.some(function(v) { return v.key === activeBlackCardKey; });
        readerChange = evt.addedKeys.some(function(v) { return v.key === currentReaderKey; });
        canSubmit = evt.addedKeys.some(function(v) { return v.key === listeningForSubmissionKey; });
        newCards = evt.addedKeys.some(function(v) { return v.key === localParticipantNewCards; });

        if(questionChange || readerChange || canSubmit || newCards) {
          item.activeQuestion = (questionChange ? black[getJSONValue(activeBlackCardKey)] : item.activeQuestion);
          item.currentReader = (readerChange ? getJSONValue(currentReaderKey) : item.currentReader);
          item.canSubmit = (canSubmit ? getJSONValue(listeningForSubmissionKey) : item.canSubmit);
          if(newCards) {
            item.newCards = [];
            angular.forEach(getJSONValue(localParticipantNewCards), function(c, i) {
              item.newCards[i] = white[c];
            });
            gapi.hangout.data.clearValue(localParticipantNewCards);
          }
          $rootScope.$apply();
        }
      });
    return item;
  }])
  .controller('TableCtrl', ['$scope', '$sce', 'gameState', 'localParticipantId', 'submitCards', 'watchForSubmittedCards', 'drawNewQuestion', 'watchForNewParticipants', 'transferToNextPlayer', 'returnCards', function($scope, $sce, gameState, localParticipantId, submitCards, watchForSubmittedCards, drawNewQuestion, watchForNewParticipants, transferToNextPlayer, returnCards) {
    var cancelReader,
        cancelNewParticipantsWatch,
        blankCard = { text: '' };

    function ChangeOfActiveQuestion() {
      return gameState.activeQuestion;
    }

    function AmICurrentReader() {
      return gameState.currentReader === localParticipantId;
    }

    function CanSubmit() {
      return gameState.canSubmit;
    }

    function NewCardsDealt() {
      return gameState.newCards;
    }

    $scope.hand = [];
    $scope.submittedCards = [];

    $scope.selectCard = function(index) {
      var card = $scope.hand.splice(index, 1)[0];
      $scope.submittedCards.push(card);
    };

    $scope.unselectCard = function(index) {
      var card = $scope.submittedCards.splice(index, 1)[0];
      $scope.hand.push(card);
    };

    $scope.disableSubmit = false;
    var overlays = [],
        padding = 0.05,
        imageResource = gapi.hangout.av.effects.createImageResource('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAD6CAYAAADk6gg4AAAcgUlEQVR4Xu1dB7AURdftRZKoBBNmMKKAOYsKplLAiFkwI1UGMBIsSgUVBSPBCJhKMaGoZQlmQcWsnwoKhiJYJsRAECXu/Pe0r9/fb9nZnblv3wO2T1c1y+6bO9P33D7dt9OdjCltaie3Q+4oeXfJ9SUvr3gEPpGbVPxe2ifzbqEgMFcUrVuR68gn8lLJ/5M8QfLkilwSPDIluEs/uccZkneWPL+CAFVu26xZs0iyyZcbNmxYgiLwFuWKwOLFi81ff/0Vl3Pr7xLBYXFFHZwinw9IHlYdbLQEaS4P7S+5Z0WBqtTydu3aRZJN586do1133dU0aNAgs2zZMpPJZAw+ly9fbpo0aWLq16+vfX51dKbsGojA3Llzo7p165p69eqZOnXq2Lx06dLo888/Ny+99FJm8uTJRnJufQJZUDdHSB4keU5a1dNW0BbygDskw4Va239Y3759V5x55pmZNm3aZBYsWGAaN26c9t5py87riYBFYMmSJZFk1Dnz1VdfRaNHjzZDhw6F6+XSvxX/gQt2heTZSaFLU4nPlpsOlAyS2NS8efOof//+Uc+ePTPoCsVdSnO/pGXkdUQgFQIgjHgtZsSIEdGgQYMyc+bM8eslyNFb8tgkN01aoUfLzU6U3BQ33WqrrbLCUNOxY8cMSZEEZl6zKhCQRjvCcydMmBBdfvnlZvbs2a5XmSc/Pyu5e7FyJSHIdHBCsnWpzjnnnOzAgQNBEr8LK/Yc/p0IrFIEhBxR7969zdixY12dh9s1U3KbQgUrRpCvRXgndwPx7bInnnhipmnTpsXkVikYfDgRyIfAvHnzomeffTbq3r2737hPk2tbxyFWqKKj52jlBL/99tvslltuSZeKdW+NRgBu18yZM6PWrVv7JEFHkLcniSMIxhxY27Bu1fTp07OtWrWiS7VGVw0W3kfgm2++ye64446uTsPdelzySmOSfATBbNVQyXZAjp5j++23JzlYv8oOgWnTpmW9ngQD9x6Sq8xu5RIEU7iTJNupXIw5unbtSreq7KoGFQICcLfGjBnjj0kwBdxecuU6SS5BMPXVBcKYrbrzzjs5IGddKmsEMHDv0aOHP7s1ThTGkoZNPkGwfWSW5IYtWrTITpo0KSOfnK0q6+pB5YDADz/8kD3ooIPwiaEEtqe0lGy3pfgEGC7fsbfKjBs3LnvCCSdw3MH6o0ZgxYoVJorsOp3BHqrVPT333HPZLl26oM5jwI5Jql65BLHaYPvIrFmzEm8bef75542Qyeo/atQoI3PMVbDAFpSDDz7YfPzxx/b3L774wuyyyy6rO14lLx9wcJWlpivMsGHDzGWXXVapwxtvvGEOPfTQkutU6Ia9evXCVg97CWy/11571crztThjPNKyZUvjbUuxnYfrQbBl/TrJDYcPH56VvVWJe49nnnnGnHzyyVb5u+++21x00UUrEWTPPfc0X3+NqebaBatWLJLgIX4jctddd5mLL744gZTukn/++cfsvffelXjjLueff75tvLCburbSqiBIdXAGQQSjSMrt3CxwYphDDHvn2wI86RbRkyRGMglB9t13X/Pll18GS5BiGJWy0r733nsGRw38tPHGG5upU6eajTbaqJSPKngvnyCffPKJQSNZ06kEOEfSiLi6P1XKu7P7Yt2rfv36rRgwYEAdnN9IqkyxQqHLK0SQGTNmGJmPNo0aNbJ7/bfYYguDrs5P2D7vzpOsv/769vDMlClTsM3ZbLDBBtZly+e2/Pjjj1jkNGuttZbZZJNNzE477WRl5RyBbU1RcfyE1hcV7Oeff7Z/X2eddcz+++9vNt100yrX/fnnn5XlQaXzW+bffvvN+t7+/bH9+oILLrD3uP322w0qT255HQ6QlXMyZptttjHbbbddUjNUXic2NEOGDFlJTrZYGPGx894vLU5JbPb777+bv//+22AsIvv2rG2RtLZMgk8SnAsBil5E8IvERXUelGULmpvxkhtLK5OV8xyJ3Ss8zCdIvjEIKjb8z9weBJUROyxHjhy5UplBkjfffNPIAqX9G1yEBx980Ky33npm8ODBK7koqOjvvvtu5fWQueeee1a6Dn447osEGZAHpxyR3nrrrVg/HW4RXEdUehA+zmVctGiRJSuMifvjMM9RRx1VqbuvqPPLgQPI8/jjWMitmuAqyeDRbL755omIgsq3++672+fnptNOO8089thjtrHwUxqcNDbDsz766CPr9mlsmQQfNJJ+I5wP50QAykVyniTbtm1bcGCB5E4gSB/JtslJ615BxifIJZdcYk455RR7YhAJFQqV5uijj64sHyoGKhgM9vTTT8eWGy0o3IK1117btrhuwBcnALdi4sSJtmVGRZDDW7H3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');

    for (var i = 0; i < 3; i++) {
      overlays.unshift(imageResource.createOverlay({scale: { magnitude: 0.15, reference: gapi.hangout.av.effects.ScaleReference.WIDTH }, position: {x: -0.5 + (padding*i), y: 0.5 - (padding*i)}}));
    }

    $scope.submitCards = function(cards) {
      submitCards(cards);
      angular.forEach(cards, function(c, i) {
        overlays[i].setVisible(true);
      });
      $scope.submittedCards = [];
      $scope.disableSubmit = true;
    };

    $scope.isReader = false;

    $scope.$watch(ChangeOfActiveQuestion, function(newVal) {
      $scope.disableSubmit = !newVal;
      $scope.question = (!!newVal ? newVal : blankCard);
      $scope.question.text = $sce.trustAsHtml($scope.question.text);
    });

    $scope.$watch(AmICurrentReader, function(newVal) {
      $scope.isReader = newVal;
      if(newVal) {
        $scope.submittedPlayers = [];
        $scope.disableDrawQuestion = false;
        $scope.disableShowAnswers = true;
        $scope.disableMoveToNext = true;

        cancelNewParticipantsWatch = watchForNewParticipants(function(participants) {
          var newPlayers = [],
              arrayOf10 = [0,1,2,3,4,5,6,7,8,9];

          angular.forEach(participants, function(p) {
            newPlayers.push({
              player: p.id,
              cards: arrayOf10
            });
          });

          returnCards(newPlayers);
        });
      }
    });

    $scope.$watch(CanSubmit, function(newVal) {
      if(!!newVal) {
        $scope.disableSubmit = false;
      } else {
  angular.forEach(overlays, function(o) {
    o.setVisible(false);
  });
        $scope.disableSubmit = true;
      }
    });

    $scope.$watch(NewCardsDealt, function(newVal) {
      if(angular.isArray(newVal)) {
        $scope.hand = $scope.hand.concat(newVal);
      }
    });

    /* Dealer-specific */
    $scope.moveToNext = function() {

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = true;

      transferToNextPlayer();
      returnCards($scope.submittedPlayers);

      cancelNewParticipantsWatch();
    };

    $scope.showAnswers = function() {
      cancelReader();

      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = true;
      $scope.disableMoveToNext = false;
    };

    $scope.drawNewQuestion = function() {
      $scope.submittedPlayers = [];
      drawNewQuestion();
      $scope.disableDrawQuestion = true;
      $scope.disableShowAnswers = false;
      $scope.disableMoveToNext = true;

      cancelReader = watchForSubmittedCards(function(newSubmissions) {
        angular.forEach(newSubmissions, function(submission) {
          $scope.submittedPlayers.push({
              player: submission.lastWriter,
              cards: submission.value
          });
        });
      });
    };
  }]);
