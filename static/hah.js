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
    $scope.submitCards = function(cards) {
      submitCards(cards);
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
